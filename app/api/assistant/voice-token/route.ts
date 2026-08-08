import { auth } from "@/lib/auth/server";
import { getPremiumEntitlement } from "@/server/lib/premium-entitlement";
import { readAssistantUsage } from "@/server/lib/assistant-usage";

// Mints a short-lived Deepgram token so the BROWSER can open the live
// transcription socket itself.
//
// Why the browser and not a Durable Object proxy: a browser WebSocket cannot
// set an Authorization header, which is the usual reason people proxy realtime
// STT through their own server. Deepgram accepts the token as a WebSocket
// SUBPROTOCOL instead (`['bearer', <token>]`), so the browser can authenticate
// directly and the audio never round-trips through our infrastructure. That
// removes a whole tier from the design — no DO, no `env.AI` binding, no
// per-connection worker cost, and one less hop of latency on every syllable.
//
// The tradeoff this route exists to manage: the token is bearer credentials in
// a browser. Three things keep that honest.
//   1. DEEPGRAM_API_KEY never leaves the server. The grant endpoint issues a
//      derived token; the real key is not recoverable from it.
//   2. TTL is 60s. It is only needed to OPEN the socket — an established
//      connection outlives it — so a stolen token buys a minute of somebody
//      else's transcription, not an account.
//   3. It is minted per press, not per page load, so an idle tab is never
//      sitting on a live credential.
const TTL_SECONDS = 60;

export async function POST(request: Request) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) {
        return Response.json({ error: "voice isn't configured yet" }, { status: 503 });
    }

    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
        return Response.json({ error: "you need to be signed in" }, { status: 401 });
    }

    // Voice is metered by the same allowance as typing, and checked with the
    // READ-ONLY peek: pressing the mic must not itself consume a message. The
    // send that follows spends one, exactly as a typed send would.
    //
    // The point is that being out of messages has to stop voice too. Otherwise
    // the cheap meter (messages) gates the expensive path (Deepgram minutes are
    // billed per minute of audio, whether or not a reply is ever generated).
    //
    // Redis-degraded fails OPEN, matching spendAssistantMessage: an outage in
    // the counter shouldn't take the product down. A minute of STT is a far
    // smaller loss than a dead mic button for everyone.
    const entitlement = await getPremiumEntitlement(session.user.id);
    const usage = await readAssistantUsage(session.user.id, entitlement);
    if (!usage.degraded && usage.messages >= usage.quota.messages) {
        return Response.json(
            {
                error: entitlement.entitled
                    ? `you've used your ${entitlement.tierKey} ai allowance for this billing period`
                    : "you've used today's free ai messages — upgrade for more",
                code: "quota_exhausted",
                upgrade: !entitlement.entitled,
                resetAt: usage.resetAt.toISOString(),
            },
            { status: 402 },
        );
    }

    const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: { authorization: `Token ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl_seconds: TTL_SECONDS }),
    });

    if (!res.ok) {
        return Response.json({ error: "couldn't start voice" }, { status: 502 });
    }

    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) {
        return Response.json({ error: "couldn't start voice" }, { status: 502 });
    }

    // no-store: this is a credential, and a cached one would be handed to the
    // next user through any shared cache between here and the browser.
    return Response.json(
        { token: json.access_token, expiresIn: json.expires_in ?? TTL_SECONDS },
        { headers: { "cache-control": "no-store" } },
    );
}
