/**
 * Fetch the recommended compute unit price (microlamports) from Helius.
 * Falls back to a reasonable default so a fee API failure never blocks a tx.
 */
export async function getRecommendedMicrolamports(accountKeys?: string[]): Promise<number> {
    // This runs in the BROWSER (both send views call it), so it must never see
    // an RPC URL with our key in it. HELIUS_RPC_URL is server-only, so on the
    // server this goes straight to Helius; in the browser it's undefined and the
    // call goes through our own proxy, which adds the key on the way out.
    const url =
        process.env.HELIUS_RPC_URL ?? `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/rpc`;
    if (!url) return 10_000;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'pfe',
                method: 'getPriorityFeeEstimate',
                params: [{ accountKeys: accountKeys ?? [], options: { recommended: true } }],
            }),
        });
        if (!res.ok) return 10_000;
        const json = await res.json();
        const fee = json?.result?.priorityFeeEstimate;
        return typeof fee === 'number' && fee > 0 ? Math.ceil(fee) : 10_000;
    } catch {
        return 10_000;
    }
}
