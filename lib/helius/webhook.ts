const API_KEY = process.env.HELIUS_API_KEY!;
const WEBHOOK_ID = process.env.HELIUS_WEBHOOK_ID!;
const BASE = `https://api.helius.xyz/v0/webhooks/${WEBHOOK_ID}?api-key=${API_KEY}`;

/**
 * Appends addresses to the Helius enhanced webhook (max 100k).
 * Fetches current config, merges new addresses (deduped), then PUTs back.
 * Called non-blocking from create-wallet so signup latency is unaffected.
 */
export async function registerWebhookAddresses(addresses: string[]): Promise<void> {
    if (!API_KEY || !WEBHOOK_ID) return;

    const res = await fetch(BASE);
    if (!res.ok) throw new Error(`Helius GET webhook failed: ${res.status}`);
    const config = await res.json();

    const existing: string[] = config.accountAddresses ?? [];
    const merged = Array.from(new Set([...existing, ...addresses]));

    if (merged.length === existing.length) return; // nothing new

    const put = await fetch(BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            webhookURL: config.webhookURL,
            transactionTypes: ["ANY"],
            accountAddresses: merged,
            webhookType: config.webhookType ?? "enhanced",
            authHeader: config.authHeader,
        }),
    });

    if (!put.ok) throw new Error(`Helius PUT webhook failed: ${put.status}`);
}
