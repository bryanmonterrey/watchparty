// Helius webhook receiver for user-wallet activity ("rung 2" of the indexer
// ladder — see lib/wallet/assets-webhook.ts). For every wallet touched by a
// transaction we (a) bust the SWR'd getWalletAssets Redis snapshot so the
// next fetch is fresh, and (b) broadcast on that wallet's Supabase realtime
// topic so mounted headers refetch immediately — deposits appear in seconds
// instead of waiting out the cache + polling interval.
import { NextRequest, NextResponse } from "next/server";
import { invalidateCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

type TokenTransfer = { fromUserAccount?: string; toUserAccount?: string };
type NativeTransfer = { fromUserAccount?: string; toUserAccount?: string };
type HeliusEvent = {
    signature?: string;
    tokenTransfers?: TokenTransfer[];
    nativeTransfers?: NativeTransfer[];
};

// Fan-out to clients via Supabase realtime's HTTP broadcast endpoint — no
// websocket needed server-side. Clients subscribe to wallet-assets:{address}.
async function broadcastAssetsChanged(addresses: string[]) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || addresses.length === 0) return;
    try {
        await fetch(`${url}/realtime/v1/api/broadcast`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                apikey: key,
                authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
                messages: addresses.map((address) => ({
                    topic: `wallet-assets:${address}`,
                    event: "changed",
                    payload: { address },
                })),
            }),
        });
    } catch (e) {
        console.error("wallet-assets broadcast failed", e);
    }
}

export async function POST(req: NextRequest) {
    if (process.env.HELIUS_WEBHOOK_SECRET) {
        const auth = req.headers.get("authorization");
        if (auth !== process.env.HELIUS_WEBHOOK_SECRET) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    let events: HeliusEvent[] = [];
    try {
        const json = await req.json();
        events = Array.isArray(json) ? json : [];
    } catch {
        return NextResponse.json({ ok: true });
    }

    // Collect wallet-level participants (from/to of transfers — precise,
    // unlike accountData which includes token accounts and programs). Busting
    // a counterparty that isn't a user is a harmless Redis DEL miss and a
    // broadcast topic nobody subscribes to.
    const addresses = new Set<string>();
    for (const ev of events) {
        for (const t of ev.tokenTransfers ?? []) {
            if (t.fromUserAccount) addresses.add(t.fromUserAccount);
            if (t.toUserAccount) addresses.add(t.toUserAccount);
        }
        for (const n of ev.nativeTransfers ?? []) {
            if (n.fromUserAccount) addresses.add(n.fromUserAccount);
            if (n.toUserAccount) addresses.add(n.toUserAccount);
        }
    }
    // Safety cap — a pathological tx (airdrop batch) shouldn't fan out wide.
    const list = [...addresses].slice(0, 50);

    // Both keys: `holdings` is the live one (balances + metadata, long window
    // — this webhook IS its freshness), `assets` is the pre-split key, still
    // busted so anything cached under it before the deploy can't outlive a tx.
    await Promise.all(list.flatMap((a) => [
        invalidateCache(`helius:holdings:${a}`),
        invalidateCache(`helius:assets:${a}`),
    ]));
    await broadcastAssetsChanged(list);

    return NextResponse.json({ ok: true, invalidated: list.length });
}
