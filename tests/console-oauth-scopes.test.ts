import { expect, test } from "bun:test";
import { OAUTH_SCOPES } from "../lib/developer/oauth-scopes";
import { OAUTH_SCOPES as CONSOLE_OAUTH_SCOPES } from "../console/lib/oauth-scopes";

// Same drift guard as console-bot-permissions.test.ts: the console vendors the
// OAuth scope catalog. If the copies diverge, the console would describe a
// grant differently from what the consent screen actually asks the user to
// approve. Deep-compare gates the deploy.
test("console's vendored OAuth scopes match lib/developer/oauth-scopes", () => {
    expect(CONSOLE_OAUTH_SCOPES).toEqual(OAUTH_SCOPES);
});

// Every scope must carry user-legible copy — a scope with no label/desc would
// render an empty row on the consent screen.
test("every OAuth scope has consent copy", () => {
    for (const s of OAUTH_SCOPES) {
        expect(s.label.length).toBeGreaterThan(0);
        expect(s.desc.length).toBeGreaterThan(0);
    }
});
