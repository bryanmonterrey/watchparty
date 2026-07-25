// Alchemy Address Activity webhook — the EVM counterpart to helius-assets.
//
// Push instead of polling: when a watched address moves funds on any EVM
// chain, bust that address's cached balances/activity and broadcast on its
// realtime topic so an open wallet refetches immediately. Without this a
// deposit takes up to the 30s cache + 30s poll to appear.
//
// Webhooks rather than WebSockets on purpose: this deploys to Cloudflare
// Workers, which can't hold a long-lived upstream socket in a request handler,
// and a browser-direct WSS would expose ALCHEMY_API_KEY to every client.
//
// Setup (Alchemy dashboard → Notify):
//   ALCHEMY_WEBHOOK_SIGNING_KEY  signing key for THIS webhook
//   ALCHEMY_AUTH_TOKEN           Notify auth token (not the API key)
//   ALCHEMY_WEBHOOK_ID           id of the ADDRESS_ACTIVITY webhook

import { NextRequest, NextResponse } from "next/server";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { getAddress } from "viem";
import { invalidateCache } from "@/lib/cache";
import { CHAINS } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";

export const dynamic = "force-dynamic";

/** Alchemy's webhook network names → our chain ids. */
const NETWORK_TO_CHAIN: Record<string, ChainId> = {
  ETH_MAINNET: "ethereum",
  BASE_MAINNET: "base",
  MATIC_MAINNET: "polygon",
  BNB_MAINNET: "bnb",
};

interface AlchemyActivity {
  fromAddress?: string;
  toAddress?: string;
  hash?: string;
}

interface AlchemyWebhookBody {
  type?: string;
  event?: { network?: string; activity?: AlchemyActivity[] };
}

/** Constant-time compare — a fast-exit strcmp leaks the signature byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Fan-out via Supabase realtime's HTTP broadcast — no server-side socket. */
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
    console.error("alchemy-assets broadcast failed", e);
  }
}

export async function POST(req: NextRequest) {
  // Signature is over the RAW body, so read text before parsing.
  const raw = await req.text();

  const signingKey = process.env.ALCHEMY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const provided = req.headers.get("x-alchemy-signature") ?? "";
    const expected = bytesToHex(hmac(sha256, new TextEncoder().encode(signingKey), new TextEncoder().encode(raw)));
    if (!timingSafeEqual(provided, expected)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  } else {
    // Fail closed: an unsigned endpoint that busts caches is a free DoS lever.
    console.error("alchemy-assets: ALCHEMY_WEBHOOK_SIGNING_KEY unset, rejecting");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: AlchemyWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  if (body.type && body.type !== "ADDRESS_ACTIVITY") {
    return NextResponse.json({ ok: true });
  }

  const chain = NETWORK_TO_CHAIN[body.event?.network ?? ""];
  const addresses = new Set<string>();
  for (const activity of body.event?.activity ?? []) {
    if (activity.fromAddress) addresses.add(activity.fromAddress.toLowerCase());
    if (activity.toAddress) addresses.add(activity.toAddress.toLowerCase());
  }

  if (addresses.size === 0) return NextResponse.json({ ok: true });

  // Case matters here. Cache keys are built from the address as stored in
  // wallet_addresses, which is EIP-55 checksummed (viem's privateKeyToAccount),
  // but webhook payloads arrive lowercased. Deleting only the lowercased key
  // silently misses every time — the DEL succeeds, the cache stays warm, and
  // the balance looks stale for the full TTL. Bust both spellings; a miss is a
  // harmless no-op, whereas a miss on the real key defeats the whole webhook.
  const spellings = new Set<string>();
  for (const address of addresses) {
    spellings.add(address);
    try {
      spellings.add(getAddress(address));
    } catch {
      // Not a valid EVM address — the lowercase form is all we have.
    }
  }

  const evmChainIds = CHAINS.filter((c) => c.kind === "evm").map((c) => c.id);

  await Promise.all(
    [...spellings].flatMap((address) => {
      const keys = [
        // The batched key is the one the aggregated tokens list actually reads.
        `assets:evm-batch:${address}`,
        ...(chain ? [`assets:${chain}:${address}`, `activity:${chain}:${address}:25`] : []),
        // Network is usually present; if not, clear every EVM chain for it.
        ...(chain ? [] : evmChainIds.map((id) => `assets:${id}:${address}`)),
      ];
      return keys.map((k) => invalidateCache(k).catch(() => {}));
    })
  );

  // Clients subscribe with the checksummed address they were served, so the
  // broadcast has to cover both spellings for the same reason.
  await broadcastAssetsChanged([...spellings]);

  return NextResponse.json({ ok: true, addresses: addresses.size, chain: chain ?? null });
}
