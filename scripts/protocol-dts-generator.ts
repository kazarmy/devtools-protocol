import * as fs from 'fs'
import * as path from 'path'
import {IProtocol, Protocol as P} from './protocol-schema'

// TODO: @noj validate this via https://github.com/andischerer/typescript-json-typesafe against protocol-schema.d.ts
const jsProtocol: IProtocol = require('../json/js_protocol.json')
const browserProtocol: IProtocol = require('../json/browser_protocol.json')
const protocolDomains: P.Domain[] = jsProtocol.domains.concat(browserProtocol.domains)

let numIndents = 0
let emitStr = ''

const emit = (str: string) => {
    emitStr += str
}

const getIndent = () => '    '.repeat(numIndents) // 4 spaced indents

const emitIndent = () => {
    emitStr += getIndent()
}

const emitLine = (str?: string) => {
    if (str) {
        emitIndent()
        emit(`${str}\n`)
    } else {
        emit('\n')
    }
}

const emitOpenBlock = (str: string, openChar = ' {') => {
    emitLine(`${str}${openChar}`)
    numIndents++
}

const emitCloseBlock = (closeChar = '}') => {
    numIndents--
    emitLine(closeChar)
}

const emitHeaderComments = () => {
    emitLine('/***********************************************************************')
    emitLine(' * Auto-generated by protocol-dts-generator.ts at                      *')
    emitLine(' * https://github.com/kazarmy/devtools-protocol, do not edit manually. *')
    emitLine(' ***********************************************************************/')
    emitLine()
}

const fixCamelCase = (name: string): string => {
    let prefix = '';
    let result = name;
    if (name[0] === '-') {
      prefix = 'Negative';
      result = name.substring(1);
    }
    const refined = result.split('-').map(toTitleCase).join('');
    return prefix + refined.replace(/HTML|XML|WML|API/i, match => match.toUpperCase());
};


const emitEnum = (enumName: string, enumValues: string[]) => {
    emitOpenBlock(`const enum ${enumName}`);
    enumValues.forEach(value => {
      emitLine(`${fixCamelCase(value)} = '${value}',`);
    });
    emitCloseBlock();
};

const emitPublicDocDeclaration = () => {
    emitLine('/**');
    emitLine(' * The Chrome DevTools Protocol.');
    emitLine(' */')
}

const emitModule = (moduleName: string, domains: P.Domain[]) => {
    moduleName = toTitleCase(moduleName)
    emitHeaderComments()
    emitPublicDocDeclaration()
    emitOpenBlock(`export namespace ${moduleName}`)
    emitGlobalTypeDefs()
    domains.forEach(emitDomain)
    emitCloseBlock()
    emitLine()
    emitLine(`export default ${moduleName};`)
}

const emitGlobalTypeDefs = () => {
    emitLine(`type integer = number;`)
}

const emitDomain = (domain: P.Domain) => {
    const domainName = toTitleCase(domain.domain)
    emitLine()
    emitDescription(domain.description)
    emitOpenBlock(`namespace ${domainName}`)
    if (domain.types) domain.types.forEach(emitDomainType)
    if (domain.commands) domain.commands.forEach(emitCommand)
    if (domain.events) domain.events.forEach(emitEvent)
    emitCloseBlock()
}

const getCommentLines = (description: string) => {
    const lines = description
        .split(/\r?\n/g)
        .map(line => ` * ${line}`)
    return [`/**`, ...lines, ` */`]
}

const emitDescription = (description?: string) => {
    if (description) getCommentLines(description).map(l => emitLine(l))
}

const isPropertyInlineEnum = (prop: P.ProtocolType): boolean => {
  if ('$ref' in prop) {
    return false;
  }
  return prop.type === 'string' && prop.enum !== null && prop.enum !== undefined;
};

const getPropertyDef = (interfaceName: string, prop: P.PropertyType): string => {
    // Quote key if it has a . in it.
    const propName = prop.name.includes('.') ? `'${prop.name}'` : prop.name
    const type = getPropertyType(interfaceName, prop);
    return `${propName}${prop.optional ? '?' : ''}: ${type}`;
};

const getPropertyType = (interfaceName: string, prop: P.ProtocolType): string  => {
    if ('$ref' in prop)
        return prop.$ref
    else if (prop.type === 'array')
        return `${getPropertyType(interfaceName, prop.items)}[]`
    else if (prop.type === 'object')
        if (!prop.properties) {
            // TODO: actually 'any'? or can use generic '[key: string]: string'?
            return `any`
        } else {
            // hack: access indent, \n directly
            let objStr = '{\n'
            numIndents++
            objStr += prop.properties
                .map(p => `${getIndent()}${getPropertyDef(interfaceName, p)};\n`)
                .join('')
            numIndents--
            objStr += `${getIndent()}}`
            return objStr
        }
    else if (prop.type === 'string' && prop.enum)
        return '(' + prop.enum.map((v: string) => `'${v}'`).join(' | ') + ')'
    return prop.type
}

const emitProperty = (interfaceName: string, prop: P.PropertyType) => {
  let description = prop.description;
  if (isPropertyInlineEnum(prop)) {
    const enumName = interfaceName + toTitleCase(prop.name);
    description = `${description || ''} (${enumName} enum)`;
  }

  emitDescription(description)
  emitLine(`${getPropertyDef(interfaceName, prop)};`)
}


const emitInlineEnumForDomainType = (type: P.DomainType) => {
  if (type.type === 'object') {
    emitInlineEnums(type.id, type.properties);
  }
};

const emitInlineEnumsForCommands = (command: P.Command) => {
  emitInlineEnums(toCmdRequestName(command.name), command.parameters);
  emitInlineEnums(toCmdResponseName(command.name), command.returns);
};

const emitInlineEnumsForEvents = (event: P.Event) => {
  emitInlineEnums(toEventPayloadName(event.name), event.parameters);
};

const emitInlineEnums = (prefix: string, propertyTypes?: P.PropertyType[]) => {
  if (!propertyTypes) {
    return;
  }
  for (const type of propertyTypes) {
    if (isPropertyInlineEnum(type)) {
      const enumName = prefix + toTitleCase(type.name);
      emitEnum(enumName, (type as P.StringType).enum || []);
    }
  }
};


const emitInterface = (interfaceName: string, props?: P.PropertyType[]) => {
    emitOpenBlock(`interface ${interfaceName}`)
    props ? props.forEach(prop => emitProperty(interfaceName, prop)) : emitLine('[key: string]: string;')
    emitCloseBlock()
}

const emitDomainType = (type: P.DomainType) => {
    emitInlineEnumForDomainType(type);
    emitDescription(type.description)

    if (type.type === 'object') {
        emitInterface(type.id, type.properties)
    } else {
        emitLine(`type ${type.id} = ${getPropertyType(type.id, type)};`)
    }
}

const toTitleCase = (str: string) => str[0].toUpperCase() + str.substr(1)

const toCmdRequestName = (commandName: string) => `${toTitleCase(commandName)}Request`

const toCmdResponseName = (commandName: string) => `${toTitleCase(commandName)}Response`

const emitCommand = (command: P.Command) => {
    emitInlineEnumsForCommands(command);
    // TODO(bckenny): should description be emitted for params and return types?
    if (command.parameters) {
        emitInterface(toCmdRequestName(command.name), command.parameters)
    }

    if (command.returns) {
        emitInterface(toCmdResponseName(command.name), command.returns)
    }
}

const toEventPayloadName = (eventName: string) => `${toTitleCase(eventName)}Event`

const emitEvent = (event: P.Event) => {
    if (!event.parameters) {
        return
    }

    emitInlineEnumsForEvents(event);
    emitDescription(event.description)
    emitInterface(toEventPayloadName(event.name), event.parameters)
}

const getEventMapping = (event: P.Event, domainName: string, modulePrefix: string): P.RefType & P.PropertyBaseType => {
    // Use TS3.0+ tuples
    const payloadType = event.parameters ?
        `[${modulePrefix}.${domainName}.${toEventPayloadName(event.name)}]` :
        '[]'

    return {
        // domain-prefixed name since it will be used outside of the module.
        name: `${domainName}.${event.name}`,
        description: event.description,
        $ref: payloadType
    }
}

const isWeakInterface = (params: P.PropertyType[]): boolean => {
    return params.every(p => !!p.optional)
}

const getCommandMapping = (command: P.Command, domainName: string, modulePrefix: string): P.ObjectType & P.PropertyBaseType => {
    const prefix = `${modulePrefix}.${domainName}.`
    // Use TS3.0+ tuples for paramsType
    let requestType = '[]'
    if (command.parameters) {
        const optional = isWeakInterface(command.parameters) ? '?' : ''
        requestType = '[' + prefix + toCmdRequestName(command.name) + optional + ']'
    }
    const responseType = command.returns ? prefix + toCmdResponseName(command.name) : 'void'

    return {
        type: 'object',
        name: `${domainName}.${command.name}`,
        description: command.description,
        properties: [{
            name: 'paramsType',
            $ref: requestType,
        }, {
            name: 'returnType',
            $ref: responseType,
        }]
    }
}

const flatten = <T>(arr: T[][]) => ([] as T[]).concat(...arr)

const emitMapping = (moduleName: string, protocolModuleName: string, domains: P.Domain[]) => {
    moduleName = toTitleCase(moduleName)
    emitHeaderComments()
    emitLine(`import Protocol from './${protocolModuleName}';`)
    emitLine()
    emitDescription('Mappings from protocol event and command names to the types required for them.')
    emitOpenBlock(`export namespace ${moduleName}`)

    const protocolModulePrefix = toTitleCase(protocolModuleName)
    const eventDefs = flatten(domains.map(d => {
        const domainName = toTitleCase(d.domain)
        return (d.events || []).map(e => getEventMapping(e, domainName, protocolModulePrefix))
    }))
    emitInterface('Events', eventDefs)

    emitLine()

    const commandDefs = flatten(domains.map(d => {
        const domainName = toTitleCase(d.domain)
        return (d.commands || []).map(c => getCommandMapping(c, domainName, protocolModulePrefix))
    }))
    emitInterface('Commands', commandDefs)

    emitCloseBlock()
    emitLine()
    emitLine(`export default ${moduleName};`)
}

const emitApiCommand = (command: P.Command, domainName: string, modulePrefix: string) => {
    const prefix = `${modulePrefix}.${domainName}.`
    emitDescription(command.description)
    const params = command.parameters ? `params: ${prefix}${toCmdRequestName(command.name)}` : ''
    const response = command.returns ? `${prefix}${toCmdResponseName(command.name)}` : 'void'
    emitLine(`${command.name}(${params}): Promise<${response}>;`)
}

const emitApiEvent = (event: P.Event, domainName: string, modulePrefix: string) => {
    const prefix = `${modulePrefix}.${domainName}.`
    emitDescription(event.description)
    const params = event.parameters ? `params: ${prefix}${toEventPayloadName(event.name)}` : ''
    emitLine(`on(event: '${event.name}', listener: (${params}) => void): void;`)
    emitLine()
    emitDescription(event.description)
    emitLine(`${event.name}(): Promise<${params ? params.slice(8) : 'void'}>;`)
}

const emitDomainApi = (domain: P.Domain, modulePrefix: string) => {
    emitLine()
    const domainName = toTitleCase(domain.domain)
    emitOpenBlock(`interface ${domainName}Api`)
    if (domain.commands) domain.commands.forEach(c => emitApiCommand(c, domainName, modulePrefix))
    if (domain.events) domain.events.forEach(e => emitApiEvent(e, domainName, modulePrefix))
    emitCloseBlock()
}

const emitApi = (moduleName: string, protocolModuleName: string, domains: P.Domain[]) => {
    moduleName = toTitleCase(moduleName)
    emitHeaderComments()
    emitLine(`import Protocol from './${protocolModuleName}';`)
    emitLine()
    emitDescription('API generated from Protocol commands and events.')
    emitOpenBlock(`export namespace ${moduleName}`)

    emitOpenBlock(`interface ProtocolApi`)
    domains.forEach(d => {
        emitLine(`${d.domain}: ${d.domain}Api;`)
    });
    emitCloseBlock()
    emitLine()

    const protocolModulePrefix = toTitleCase(protocolModuleName)
    domains.forEach(d => emitDomainApi(d, protocolModulePrefix))
    emitCloseBlock()

    emitLine()
    emitLine(`export default ${moduleName};`)
}

const flushEmitToFile = (path: string) => {
    console.log(`Writing to ${path}`)
    fs.writeFileSync(path, emitStr, {encoding: 'utf-8'})

    numIndents = 0
    emitStr = ''
}

// Main
const destProtocolFilePath = `${__dirname}/../types/protocol.d.ts`
const protocolModuleName = path.basename(destProtocolFilePath, '.d.ts')
emitModule(protocolModuleName, protocolDomains)
flushEmitToFile(destProtocolFilePath)

const destMappingFilePath = `${__dirname}/../types/protocol-mapping.d.ts`
const mappingModuleName = 'ProtocolMapping'
emitMapping(mappingModuleName, protocolModuleName, protocolDomains)
flushEmitToFile(destMappingFilePath)

const destApiFilePath = `${__dirname}/../types/protocol-proxy-api.d.ts`
const apiModuleName = 'ProtocolProxyApi'
emitApi(apiModuleName, protocolModuleName, protocolDomains)
flushEmitToFile(destApiFilePath)
