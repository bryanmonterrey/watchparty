import { beforeAll, describe, expect, test } from "bun:test";
import { isAllowedWebhookUrl, isBlockedWebhookHost } from "../lib/developer/webhook-url";

// Pure logic only (house rule for this suite): the URL blocklist matrix and
// the secret-box roundtrip. Both run without DB or network.

describe("webhook endpoint host blocklist", () => {
  const blocked = [
    "watchparty.xyz",
    "console.watchparty.xyz",
    "api.watchparty.xyz",
    "localhost",
    "app.localhost",
    "router.local",
    "metadata.internal",
    "127.0.0.1",
    "10.0.0.8",
    "169.254.169.254",
    "[::1]",
    // Trailing-dot FQDN resolves to the same records but dodges a naive
    // endsWith — must still be blocked (security-review finding).
    "watchparty.xyz.",
    "console.watchparty.xyz.",
  ];
  const allowed = [
    "example.com",
    "webhook.site",
    "my-watchparty.xyz.example.com",
    "hooks.slack.com",
    "notwatchparty.xyz.dev",
  ];

  for (const h of blocked) {
    test(`blocks ${h}`, () => {
      expect(isBlockedWebhookHost(h)).toBe(true);
      expect(isAllowedWebhookUrl(`https://${h}/hook`)).toBe(false);
    });
  }
  for (const h of allowed) {
    test(`allows ${h}`, () => {
      expect(isBlockedWebhookHost(h)).toBe(false);
      expect(isAllowedWebhookUrl(`https://${h}/hook`)).toBe(true);
    });
  }

  test("rejects malformed urls", () => {
    expect(isAllowedWebhookUrl("not a url")).toBe(false);
  });
});

describe("secret box", () => {
  beforeAll(() => {
    process.env.API_GATE_SECRET = "test-gate-secret-for-hardening-suite";
  });

  test("seals and opens a secret round-trip", async () => {
    const { sealSecret, openSecret } = await import("../lib/developer/secret-box");
    const plain = "whsec_0123456789abcdef0123456789abcdef01234567";
    const sealed = await sealSecret(plain);
    expect(sealed.startsWith("enc1:")).toBe(true);
    expect(sealed).not.toContain(plain);
    expect(await openSecret(sealed)).toBe(plain);
  });

  test("distinct ciphertexts per call (fresh IV)", async () => {
    const { sealSecret } = await import("../lib/developer/secret-box");
    expect(await sealSecret("same")).not.toBe(await sealSecret("same"));
  });

  test("passes plaintext through untouched (defensive fallback)", async () => {
    const { openSecret } = await import("../lib/developer/secret-box");
    expect(await openSecret("whsec_plaintext")).toBe("whsec_plaintext");
  });
});
