import { expect, test } from "bun:test";
import { BOT_PERMISSIONS } from "../lib/developer/bot-permissions";
import {
  BOT_PERMISSIONS as CONSOLE_BOT_PERMISSIONS,
  BOT_PERMISSION_META,
} from "../console/lib/bot-permissions";

// Same drift guard as console-webhook-events.test.ts: the console vendors the
// bot permission bitfield (its bundler can't import across the app boundary),
// and if the two copies of the BIT VALUES diverge a checkbox in the console
// would flip a different capability than the server enforces. Deep-compare
// gates the deploy.
test("console's vendored bot permission bits match lib/developer/bot-permissions", () => {
  expect(CONSOLE_BOT_PERMISSIONS).toEqual(BOT_PERMISSIONS);
});

// Every permission the server knows about must have UI copy, or it would be
// silently unsettable from the console.
test("every bot permission has console UI meta", () => {
  expect(BOT_PERMISSION_META.map((m) => m.name).sort()).toEqual(
    (Object.keys(BOT_PERMISSIONS) as (keyof typeof BOT_PERMISSIONS)[]).sort(),
  );
});
