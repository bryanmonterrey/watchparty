# TradingView Charting Library (token + perps charts)

Both the token page chart (`components/tokens/token-tradingview-chart.tsx`) and
the perps terminal chart (`components/perps/perps-tv-chart.tsx`) use TradingView's
**Advanced Charts / Charting Library** — the same product pump.fun uses. It is
**free but gated**: not on npm, you self-host the files.

**Status: installed.** The library files live under `public/charting_library/`
and `public/datafeeds/` and are **committed to this (private) repo**. If a script
ever fails to load, both charts fall back to their lightweight-charts renderer
(`TokenCandlestickChart` / `PerpsChart`) so a chart is always on screen.

## Where the files come from (and how to update)

Access was granted to the private GitHub repo `tradingview/charting_library`
(apply at https://www.tradingview.com/charting-library/). To install or update:

```bash
gh repo clone tradingview/charting_library -- --depth 1 /tmp/tvcl
rm -rf public/charting_library public/datafeeds
cp -R /tmp/tvcl/charting_library public/charting_library
cp -R /tmp/tvcl/datafeeds        public/datafeeds
```

These must resolve at runtime (the components load them by absolute path):
- `/charting_library/charting_library.standalone.js`
- `/datafeeds/udf/dist/bundle.js`

## Why the files are committed (not gitignored)

The TradingView license only forbids *public* redistribution; **this repo is
private**, so committing is permitted and is the simplest path for the
Cloudflare CI deploy (the build just needs the files present — no separate
vendoring step, no license token in CI). They add ~31 MB (2.3k lazy-loaded
locale/theme/feature chunks; largest single file ~2 MB, well under Cloudflare's
25 MiB/file and 20k-file asset limits).

> **Do not gitignore these or move the repo public.** Gitignoring them breaks the
> deploy (CI would ship without the chart); a public repo would violate the license.

`public/` is excluded from `tsconfig.json` so the datafeed's bundled `.ts`/`.d.ts`
source is never type-checked (it would otherwise fail `tsc --noEmit`).

## How it's wired

- **Datafeed**: `Datafeeds.UDFCompatibleDatafeed("/api/udf")` (UDF = Universal Data Feed).
- **UDF server**: `app/api/udf/[[...path]]/route.ts` implements `/config`,
  `/symbols`, `/history`, `/time`.
- **OHLCV source**: `lib/tokens/udf-datafeed.ts` → GeckoTerminal pool OHLCV
  (Redis-cached), resolving the mint's best pool and base/quote side. For a LIVE
  token the symbol passed to the widget IS the Solana mint address.

### Pre-launch drafts ("No data here")

A draft token has no mint / pool / price until the first buy creates its Meteora
bonding-curve pool (the "first-buy = launch" model), so there's no real OHLCV to
plot. Drafts still render the widget (symbol `draft-<ticker>`, so the full chart
chrome shows) but the UDF `/history` handler returns `{ s: "no_data" }`, so the
widget shows its native **"No data here"** empty state — exactly what pump.fun
does for an un-traded coin. Once the token launches and `tokenAddress` is set,
the chart automatically switches to real mint-based OHLCV.

> An earlier version synthesised a **flat baseline** (every bar `o=h=l=c` at the
> curve's start price) instead. Don't do that: a zero-range series can stall the
> chart's price-scale init so `onChartReady` never fires and the loading screen
> spins forever. Empty (`no_data`) is both safer and matches pump.fun.

## Notes / follow-ups

- The UDF datafeed here is **history-only** (polled refetch). For true realtime
  candle streaming, implement `subscribeBars` with a custom JS datafeed (replace
  `UDFCompatibleDatafeed`) backed by a websocket/poll loop.
- Prices are USD per token. pump.fun shows "Market Cap (USD)" — to mirror that,
  multiply by supply in a custom datafeed or a price-scale override.
