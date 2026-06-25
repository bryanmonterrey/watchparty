# TradingView Charting Library (token chart)

The token page chart (`components/tokens/token-tradingview-chart.tsx`) uses
TradingView's **Advanced Charts / Charting Library** — the same product pump.fun
uses. It is **free but gated**: not on npm, you self-host the files.

Until the files are present, the chart shows a "library not installed"
placeholder. Everything else (the data backend) is already built and works.

## One-time setup

1. **Apply for access** at https://www.tradingview.com/charting-library/ — accept
   the license and request access to the private GitHub repo
   `tradingview/charting_library` (approval is usually quick but can take a day or two).
2. Once you have repo access, copy these two folders out of it into `public/`:
   - `charting_library/` → `public/charting_library/`
   - `datafeeds/udf/`     → `public/datafeeds/udf/`
   So these resolve at runtime:
   - `/charting_library/charting_library.standalone.js`
   - `/datafeeds/udf/dist/bundle.js`
3. They're large/licensed — keep them out of git. Add to `.gitignore`:
   ```
   /public/charting_library/
   /public/datafeeds/
   ```
   For deploy (Cloudflare), commit them to a private build step or vendor them in
   CI from a private source; do not commit the licensed files to a public repo.

## How it's wired

- **Datafeed**: `Datafeeds.UDFCompatibleDatafeed("/api/udf")` (UDF = Universal Data Feed).
- **UDF server**: `app/api/udf/[[...path]]/route.ts` implements `/config`,
  `/symbols`, `/history`, `/time`.
- **OHLCV source**: `lib/tokens/udf-datafeed.ts` → GeckoTerminal pool OHLCV
  (Redis-cached), resolving the mint's best pool and base/quote side. The symbol
  passed to the widget IS the Solana mint address.

## Notes / follow-ups

- The UDF datafeed here is **history-only** (polled refetch). For true realtime
  candle streaming, implement `subscribeBars` with a custom JS datafeed (replace
  `UDFCompatibleDatafeed`) backed by a websocket/poll loop.
- Prices are USD per token. pump.fun shows "Market Cap (USD)" — to mirror that,
  multiply by supply in a custom datafeed or a price-scale override.
