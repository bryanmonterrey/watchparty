import { expect, test } from "bun:test";
import { PRICE_SHEET } from "../lib/api-pricing";
import { PRICE_SHEET as CONSOLE_PRICE_SHEET } from "../console/lib/price-sheet";

// The console vendors the public price sheet (its bundler can't import
// across the app boundary — console/lib/price-sheet.ts explains why). This
// deep-compare is the drift guard: change lib/api-pricing.ts and this fails
// until the vendored copy is updated too. It gates deploy via the test job.
test("console's vendored price sheet matches lib/api-pricing", () => {
  expect(CONSOLE_PRICE_SHEET).toEqual(PRICE_SHEET);
});
