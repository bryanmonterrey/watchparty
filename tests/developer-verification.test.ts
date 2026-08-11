import { expect, test, describe } from "bun:test";
import { computeVerification } from "../lib/developer/verification";

const full = {
  name: "My App",
  description: "Does things",
  iconUrl: "https://x/i.png",
  tosUrl: "https://x/tos",
  privacyUrl: "https://x/privacy",
  emailVerified: true,
  twoFactorEnabled: true,
};

describe("computeVerification", () => {
  test("all criteria met → complete", () => {
    const r = computeVerification(full);
    expect(r.met).toBe(5);
    expect(r.total).toBe(5);
    expect(r.complete).toBe(true);
  });

  test("missing pieces are counted and not complete", () => {
    const r = computeVerification({ ...full, tosUrl: null, twoFactorEnabled: false });
    expect(r.met).toBe(3);
    expect(r.complete).toBe(false);
    expect(r.criteria.find((c) => c.key === "tos")?.met).toBe(false);
    expect(r.criteria.find((c) => c.key === "2fa")?.met).toBe(false);
  });

  test("whitespace-only fields do not complete the profile", () => {
    expect(computeVerification({ ...full, description: "   " }).criteria.find((c) => c.key === "profile")?.met).toBe(false);
    expect(computeVerification({ ...full, iconUrl: "  " }).criteria.find((c) => c.key === "profile")?.met).toBe(false);
  });

  test("nulls everywhere → nothing met", () => {
    const r = computeVerification({
      name: null, description: null, iconUrl: null, tosUrl: null, privacyUrl: null, emailVerified: null, twoFactorEnabled: null,
    });
    expect(r.met).toBe(0);
    expect(r.complete).toBe(false);
  });

  test("criteria order is stable (the console renders in this order)", () => {
    expect(computeVerification(full).criteria.map((c) => c.key)).toEqual(["profile", "tos", "privacy", "email", "2fa"]);
  });
});
