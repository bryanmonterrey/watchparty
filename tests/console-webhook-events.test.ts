import { expect, test } from "bun:test";
import { WEBHOOK_EVENTS } from "../lib/developer/webhook-events";
import { WEBHOOK_EVENTS as CONSOLE_WEBHOOK_EVENTS } from "../console/lib/webhook-events";

// Same drift guard as console-price-sheet.test.ts: the console vendors the
// event catalog (its bundler can't import across the app boundary), and this
// deep-compare fails the deploy-gating test job until both copies match.
test("console's vendored webhook event catalog matches lib/developer/webhook-events", () => {
  expect(CONSOLE_WEBHOOK_EVENTS).toEqual(WEBHOOK_EVENTS);
});
