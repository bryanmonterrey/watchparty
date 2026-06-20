/**
 * Register (or update) a Helius webhook that watches the treasury addresses and
 * POSTs to /api/webhooks/helius-treasury, which alerts on suspicious outflows.
 *
 * Run:  bun run scripts/premium/setup-helius-alert.ts
 * Needs: HELIUS_API_KEY (or it's parsed from NEXT_PUBLIC_HELIUS_RPC_URL),
 *        NEXT_PUBLIC_BASE_URL (your prod domain), and the treasury pubkeys.
 *        Optional: HELIUS_WEBHOOK_SECRET (auth header the receiver checks).
 */
function heliusApiKey(): string {
    if (process.env.HELIUS_API_KEY) return process.env.HELIUS_API_KEY;
    const rpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "";
    const m = rpc.match(/api-key=([^&]+)/);
    if (m) return m[1];
    throw new Error("Set HELIUS_API_KEY (or NEXT_PUBLIC_HELIUS_RPC_URL with ?api-key=).");
}

async function main() {
    const apiKey = heliusApiKey();
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_AUTH_URL;
    if (!base) throw new Error("Set NEXT_PUBLIC_BASE_URL to your prod domain.");
    const webhookURL = `${base.replace(/\/$/, "")}/api/webhooks/helius-treasury`;

    const collector = process.env.NEXT_PUBLIC_COLLECTOR_PUBKEY ?? process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    const cold = process.env.TREASURY_COLD_PUBKEY;
    const accountAddresses = [collector, cold].filter(Boolean) as string[];
    if (!accountAddresses.length) throw new Error("No treasury addresses to watch (set NEXT_PUBLIC_TREASURY_PUBKEY / TREASURY_COLD_PUBKEY).");

    const payload = {
        webhookURL,
        transactionTypes: ["ANY"],
        accountAddresses,
        webhookType: "enhanced",
        ...(process.env.HELIUS_WEBHOOK_SECRET ? { authHeader: process.env.HELIUS_WEBHOOK_SECRET } : {}),
    };

    // Reuse an existing webhook for the same URL if present (idempotent).
    const list = await (await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`)).json();
    const existing = Array.isArray(list) ? list.find((w: { webhookURL?: string }) => w.webhookURL === webhookURL) : null;

    const res = existing
        ? await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          })
        : await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          });

    const out = await res.json();
    if (!res.ok) throw new Error(`Helius API error: ${JSON.stringify(out)}`);
    console.log(`✓ ${existing ? "updated" : "created"} webhook ${out.webhookID}`);
    console.log(`   watching: ${accountAddresses.join(", ")}`);
    console.log(`   → ${webhookURL}`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
});
