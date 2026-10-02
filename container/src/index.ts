import { Container, getRandom } from "@cloudflare/containers";

/**
 * The door onto the Next app.
 *
 * Everything this Worker does is hand the request to a container running the
 * real server. That's the point: the app stops being a 41 MB Worker fighting a
 * 128 MB isolate ceiling and becomes an ordinary Node process with 4 GiB, on
 * the same Cloudflare network, behind the same domain.
 *
 * The realtime Durable Object and the cron Worker are untouched — they were
 * never the problem and they're already the right shape.
 */
export class NextApp extends Container {
    /** What `node server.js` listens on in the image. */
    defaultPort = 3000;

    /**
     * Sleeps when idle — the deliberate cost choice.
     *
     * Hardware is identical whether it sleeps or not (standard-1: 4 GiB, half
     * a vCPU). Billing only runs while the instance is awake, so this is the
     * difference between roughly $10 and roughly $33 a month.
     *
     * What it buys back: the first visitor after an idle period waits for a
     * cold start. Measured on this deploy, not guessed — 4.0s cold, 0.17s
     * warm.
     *
     * 15 minutes is the compromise: long enough that one person browsing
     * several pages only ever pays it once, short enough that an idle night
     * isn't billed. Raise it if the wait shows up in real use; the number is
     * the only thing that changes.
     */
    sleepAfter = "15m";

    /**
     * Runtime env for the server, forwarded from this Worker's own bindings —
     * which are the same secrets the Worker deploy already pushes, so there is
     * one place secrets live, not two.
     *
     * Note this is RUNTIME only. NEXT_PUBLIC_* values were already inlined into
     * the client bundle when the image was built (see the Dockerfile).
     */
    envVars = Object.fromEntries(
        Object.entries(this.env as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
        ),
    ) as Record<string, string>;
}

/**
 * How many instances requests spread across. Must match `max_instances` in
 * container/wrangler.jsonc.
 *
 * Was 1, addressed by a fixed name. That is a single point of failure with a
 * HARD CEILING: Cloudflare rejects at 4096 concurrent inbound connections per
 * instance, and the rejection happens in the proxy — before the request ever
 * reaches Next — so the whole site 500s at once with
 * "There are more than 4096 concurrent connections inbound to the container".
 *
 * That is exactly what took production down on 2026-08-08, and it did NOT take
 * real traffic to do it: the Helius key was exhausted, every /api/rpc call
 * 502'd, and ~52 polling queries retrying (TanStack's default is 3 attempts)
 * plus long-lived assistant streams was enough from a single user. One
 * saturated instance had nowhere to spill.
 *
 * Three was headroom, not scale — it turned a hard ceiling into a soft one.
 *
 * Back to ONE on 2026-10-02 (owner's call, cost): "instances sleep when idle"
 * did not hold in practice. getRandom spreads the cron worker's every-minute
 * pings across all three, so none of them ever reached sleepAfter and all
 * three billed around the clock — roughly $100/month while the site was not
 * being promoted. One instance is a third of that. The 4096-connection
 * ceiling above is back as a single point of failure; if it bites again, the
 * cheaper answer is the plain `watchparty` worker (docs/buzz-adoption-plan.md
 * measured it carrying more than the containers did), not more containers.
 */
const INSTANCES = 1;

export default {
    async fetch(request: Request, env: { NEXT_APP: DurableObjectNamespace<NextApp> }) {
        // getRandom, not a fixed name: spreads connections across INSTANCES so
        // one saturated container cannot take the site with it.
        //
        // AWAITED — getRandom returns a Promise<DurableObjectStub>, unlike
        // getContainer which returns the stub directly. Chaining .fetch() off
        // the promise compiles fine and fails at runtime.
        const stub = await getRandom(env.NEXT_APP, INSTANCES);

        // Relay the real client IP across the container hop. The runtime's
        // container-port proxy rewrites the standard IP headers to its own
        // internal address — inside the Node server, x-real-ip reads 10.1.0.0
        // and cf-connecting-ip is gone — which is how every better-auth
        // session recorded 10.1.0.0 and rate limiting degraded to one shared
        // bucket for all users. A custom header survives the hop untouched.
        //
        // Set or DELETED unconditionally: every request that reaches the
        // container passes through this Worker, so the value is always ours —
        // a client-supplied x-watchparty-client-ip never survives.
        const headers = new Headers(request.headers);
        const clientIp = request.headers.get("cf-connecting-ip");
        if (clientIp) headers.set("x-watchparty-client-ip", clientIp);
        else headers.delete("x-watchparty-client-ip");
        return stub.fetch(new Request(request, { headers }));
    },
};
