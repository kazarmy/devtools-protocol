# Welcome!

This is a fork of the [devtools-protocol repo](https://github.com/ChromeDevTools/devtools-protocol) at r927104, corresponding to the npm package `devtools-protocol@0.0.927104`. The typings here have been augmented in 3 different ways:

1. Typings for Promise event methods, for statements like:

```ts
await Page.loadEventFired();
```

2. Typings for shorthand callback event methods, for statements like:

```ts
Network.requestWillBeSent((params) => {
    console.log(params.request.url);
});
```

3. Optional declarations on command object parameters with all-optional properties, to allow statements like:

```ts
await Network.enable();
```

instead of:

```ts
await Network.enable({});
```

----

The script that generates these typings is at [scripts/protocol-dts-generator.ts](https://github.com/kazarmy/devtools-protocol/blob/master/scripts/protocol-dts-generator.ts) and can be run using `npx ts-node protocol-dts-generator.ts` in the `scripts/` directory.
