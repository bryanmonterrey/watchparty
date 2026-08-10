import { describe, expect, test } from "bun:test";
import { scopesForPath, isPathInScope, API_SCOPES, PRICE_SHEET } from "../lib/api-pricing";

// The path→scope classifier is the load-bearing, tsc-invisible half of scope
// enforcement (the gate wiring is mechanical). Lock the routing and the
// membership rule down here — especially the batch and backward-compat cases.

describe("scopesForPath", () => {
  const cases: [string, string[]][] = [
    ["/api/trpc/trade.getFeed", ["coins"]],
    ["/api/trpc/trending.list", ["coins"]],
    ["/api/trpc/coinFeed.list", ["coins"]],
    ["/api/trpc/feed.home", ["content"]],
    ["/api/trpc/post.get", ["content"]],
    ["/api/trpc/stream.get", ["content"]],
    ["/api/trpc/community.list", ["content"]],
    ["/api/trpc/user.profile", ["social"]],
    ["/api/trpc/profile.get", ["social"]],
    ["/api/trpc/friends.list", ["social"]],
    ["/api/rpc", ["rpc"]],
    ["/api/udf/history", ["charts"]],
    ["/api/pyth-udf/config", ["charts"]],
    ["/api/og-preview?url=x", ["preview"]],
    ["/api/trpc/somethingElse.do", ["rest"]],
  ];
  for (const [path, expected] of cases) {
    test(`${path} → ${expected.join(",")}`, () => {
      expect(scopesForPath(path).sort()).toEqual(expected.sort());
    });
  }

  test("a tRPC batch spans every family it touches", () => {
    expect(scopesForPath("/api/trpc/trade.a,user.b,post.c").sort()).toEqual(
      ["coins", "content", "social"].sort(),
    );
  });

  test("the scope catalog is exactly the price-sheet families (lockstep)", () => {
    // The gate routes pricing and scopes off the same prefixes, and the
    // console derives its scope picker from the price sheet — they must not
    // drift apart.
    expect([...API_SCOPES].sort()).toEqual(PRICE_SHEET.map((r) => r.key).sort());
  });

  test("every scope in the catalog is reachable", () => {
    const reachable = new Set<string>();
    for (const p of [
      "/api/trpc/trade.x",
      "/api/trpc/feed.x",
      "/api/trpc/user.x",
      "/api/udf",
      "/api/rpc",
      "/api/og-preview",
      "/api/trpc/misc.x",
    ]) {
      for (const s of scopesForPath(p)) reachable.add(s);
    }
    expect([...reachable].sort()).toEqual([...API_SCOPES].sort());
  });
});

describe("isPathInScope", () => {
  test("unscoped key (null/empty) has full access — backward compat", () => {
    expect(isPathInScope("/api/trpc/user.profile", null)).toBe(true);
    expect(isPathInScope("/api/trpc/user.profile", [])).toBe(true);
    expect(isPathInScope("/api/trpc/user.profile", undefined)).toBe(true);
  });

  test("a scoped key is allowed only within its families", () => {
    expect(isPathInScope("/api/trpc/trade.feed", ["coins"])).toBe(true);
    expect(isPathInScope("/api/trpc/user.profile", ["coins"])).toBe(false);
  });

  test("a batch needs EVERY touched family granted", () => {
    expect(isPathInScope("/api/trpc/trade.a,user.b", ["coins"])).toBe(false);
    expect(isPathInScope("/api/trpc/trade.a,user.b", ["coins", "social"])).toBe(true);
  });
});
