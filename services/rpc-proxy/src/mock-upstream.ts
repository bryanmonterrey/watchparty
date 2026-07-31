// Fake Solana JSON-RPC endpoint for benchmarking: fixed artificial latency,
// canned results, echoes request ids. MOCK_DELAY_MS (default 50), MOCK_PORT (default 3999).

const delay = Number(process.env.MOCK_DELAY_MS ?? 50)
let slot = 436_286_000

function cannedResult(method: string | undefined) {
    slot += 1
    switch (method) {
        case 'getBalance':
            return { context: { slot }, value: 1_636_132_772_242 }
        case 'getLatestBlockhash':
            return {
                context: { slot },
                value: {
                    blockhash: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
                    lastValidBlockHeight: 295_000_000,
                },
            }
        default:
            return {
                context: { slot },
                value: {
                    lamports: 1_636_132_772_242,
                    data: ['QUJDRA==', 'base64'],
                    owner: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9z623t5s2y4nA9r',
                    executable: false,
                    rentEpoch: 404,
                },
            }
    }
}

function reply(req: { id?: string | number | null; method?: string }) {
    return { jsonrpc: '2.0', id: req?.id ?? null, result: cannedResult(req?.method) }
}

Bun.serve({
    port: Number(process.env.MOCK_PORT ?? 3999),
    async fetch(request) {
        const body = await request.json().catch(() => null)
        await Bun.sleep(delay)
        if (Array.isArray(body)) return Response.json(body.map(reply))
        return Response.json(reply(body ?? {}))
    },
})

console.log(`mock upstream on :${process.env.MOCK_PORT ?? 3999} (${delay}ms artificial latency)`)
