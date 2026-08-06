import { Container, getContainer } from "@cloudflare/containers";

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
     * Kept warm on purpose.
     *
     * Containers sleep when idle and cold-start in 1-3 seconds, and on a site
     * with little traffic the person paying that cost is a real visitor —
     * almost every visit would be the first one after a nap. Staying up costs a
     * couple of dollars a month more than sleeping; a two-second wait on the
     * homepage costs more than that.
     */
    sleepAfter = "8h";

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

export default {
    async fetch(request: Request, env: { NEXT_APP: DurableObjectNamespace<NextApp> }) {
        // One instance, addressed by a fixed name. Containers have no
        // autoscaling yet — scaling is choosing a number of instances and
        // routing across them yourself — and at this traffic one is right.
        // When that changes, this is the line that changes: getRandom(env.NEXT_APP, N).
        return getContainer(env.NEXT_APP, "app").fetch(request);
    },
};
