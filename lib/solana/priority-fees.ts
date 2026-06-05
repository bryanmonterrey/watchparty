/**
 * Fetch the recommended compute unit price (microlamports) from Helius.
 * Falls back to a reasonable default so a fee API failure never blocks a tx.
 */
export async function getRecommendedMicrolamports(accountKeys?: string[]): Promise<number> {
    const url = process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
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
