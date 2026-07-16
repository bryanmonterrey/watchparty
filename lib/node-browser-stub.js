// Browser stand-in for Node builtins that dependency code references but
// never executes in the browser (e.g. @drift-labs/sdk's keypair file loader,
// anchor's NodeWallet). Turbopack `resolveAlias` maps `fs` here for browser
// targets — the webpack `fallback: { fs: false }` equivalent.
module.exports = {};
