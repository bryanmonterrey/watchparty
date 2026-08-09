import { describe, expect, test } from "bun:test";
import { priceForPathMicro, defaultPriceMicro, PRICE_SHEET } from "@/lib/api-pricing";

// This module IS the bill. A wrong match here either overcharges a paying
// integrator or gives away metered upstream (Helius RPC) for a tenth of its
// price — and the gate, the landing calculator, and the docs table all read
// from it, so a regression ships to all three at once.

const usd = (n: number) => Math.round(n * 1_000_000);

describe("priceForPathMicro", () => {
    test("cheap cached coin reads are $0.001", () => {
        expect(priceForPathMicro("/api/trpc/trade.getFeed")).toBe(usd(0.001));
        expect(priceForPathMicro("/api/trpc/trending.list")).toBe(usd(0.001));
    });

    test("content reads are $0.005, social-graph reads $0.01", () => {
        expect(priceForPathMicro("/api/trpc/feed.forYou")).toBe(usd(0.005));
        expect(priceForPathMicro("/api/trpc/stream.listLive")).toBe(usd(0.005));
        expect(priceForPathMicro("/api/trpc/profile.get")).toBe(usd(0.01));
        expect(priceForPathMicro("/api/trpc/user.suggestedFollows")).toBe(usd(0.01));
    });

    test("a tRPC batch is the SUM of its procedures, not one request", () => {
        expect(priceForPathMicro("/api/trpc/trade.getFeed,comment.list")).toBe(usd(0.001) + usd(0.005));
        expect(priceForPathMicro("/api/trpc/user.get,profile.get,trade.getFeed")).toBe(
            usd(0.01) + usd(0.01) + usd(0.001),
        );
    });

    test("URL-encoded batch commas still split", () => {
        expect(priceForPathMicro("/api/trpc/trade.getFeed%2Ccomment.list")).toBe(usd(0.001) + usd(0.005));
    });

    test("upstream-metered surfaces carry their real cost", () => {
        expect(priceForPathMicro("/api/rpc")).toBe(usd(0.005));
        expect(priceForPathMicro("/api/udf/history")).toBe(usd(0.005));
        expect(priceForPathMicro("/api/pyth-udf/history")).toBe(usd(0.005));
        expect(priceForPathMicro("/api/og-preview")).toBe(usd(0.01));
    });

    test("unknown procedures and paths fall to the default bucket", () => {
        expect(priceForPathMicro("/api/trpc/quest.list")).toBe(defaultPriceMicro());
        expect(priceForPathMicro("/api/anything-else")).toBe(defaultPriceMicro());
    });

    test("/api/rpc must not price by prefix-collision (e.g. /api/rpcx)", () => {
        expect(priceForPathMicro("/api/rpcx")).toBe(defaultPriceMicro());
    });

    test("never returns zero or negative", () => {
        for (const p of ["/api/trpc/", "/api/trpc/a", "/api/rpc", "/api/x"]) {
            expect(priceForPathMicro(p)).toBeGreaterThan(0);
        }
    });
});

describe("PRICE_SHEET", () => {
    test("every row has a positive price and copy for the docs table", () => {
        for (const row of PRICE_SHEET) {
            expect(row.usd).toBeGreaterThan(0);
            expect(row.name.length).toBeGreaterThan(0);
            expect(row.desc.length).toBeGreaterThan(0);
        }
    });
});
