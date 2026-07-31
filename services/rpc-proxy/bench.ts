// Module marker so top-level await is allowed when Next.js type-checks this file.
export {}

// Minimal latency benchmark: fires N requests at C concurrency against a URL,
// reports p50/p95/mean/min/max and the x-rpc-cache header distribution.
//
//   bun run bench.ts <url> [requests] [concurrency] [payloadJSON]
//
// Default payload is a cacheable getBalance; pass a getLatestBlockhash payload
// to measure the uncached passthrough path.

const [url, nArg, cArg, payloadArg] = process.argv.slice(2)
if (!url) {
    console.error('usage: bun run bench.ts <url> [requests=200] [concurrency=20] [payloadJSON]')
    process.exit(1)
}
const total = Number(nArg ?? 200)
const concurrency = Number(cArg ?? 20)
const payload =
    payloadArg ??
    JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: ['So11111111111111111111111111111111111111112'],
    })

async function fire(): Promise<{ ms: number; cache: string; status: number }> {
    const start = performance.now()
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
    })
    await res.arrayBuffer()
    return {
        ms: performance.now() - start,
        cache: res.headers.get('x-rpc-cache') ?? '-',
        status: res.status,
    }
}

// Warmup: fills caches and JITs the route
await Promise.all(Array.from({ length: concurrency }, fire))

const latencies: number[] = []
const cacheHeaders = new Map<string, number>()
const statuses = new Map<number, number>()
let done = 0

async function lane() {
    while (done < total) {
        done += 1
        const r = await fire()
        latencies.push(r.ms)
        cacheHeaders.set(r.cache, (cacheHeaders.get(r.cache) ?? 0) + 1)
        statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1)
    }
}
const startedAt = performance.now()
await Promise.all(Array.from({ length: concurrency }, lane))
const wallMs = performance.now() - startedAt

latencies.sort((a, b) => a - b)
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))]
const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length

console.log(`\n${url}`)
console.log(`  ${total} requests @ ${concurrency} concurrent — ${(wallMs / 1000).toFixed(1)}s wall, ${(total / (wallMs / 1000)).toFixed(0)} req/s`)
console.log(`  p50 ${pct(50).toFixed(1)}ms  p95 ${pct(95).toFixed(1)}ms  mean ${mean.toFixed(1)}ms  min ${latencies[0].toFixed(1)}ms  max ${latencies[latencies.length - 1].toFixed(1)}ms`)
console.log(`  x-rpc-cache: ${[...cacheHeaders].map(([k, v]) => `${k}=${v}`).join(', ')}`)
console.log(`  status: ${[...statuses].map(([k, v]) => `${k}=${v}`).join(', ')}`)
