/**
 * Cloudflare Turnstile verification.
 *
 * Guards the endpoints where one automated caller can cost us real money or
 * real state — wallet creation above all: it mints a keypair, writes an
 * encrypted row, and eventually puts an account on-chain that the treasury pays
 * rent for. A session and an IP rate limit both bound that, but neither says
 * anything about whether a HUMAN asked.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify a widget token against Cloudflare.
 *
 * Open when unconfigured: with no `TURNSTILE_SECRET_KEY` this passes and says
 * so in the log. A captcha that fails closed on a missing env var doesn't
 * protect wallet creation, it deletes it — for every user, in every
 * environment that hasn't been given the key yet, with a generic error. The
 * moment the secret is set the check is real.
 */
export async function verifyTurnstile(
    token: string | undefined | null,
    remoteIp?: string | null,
): Promise<TurnstileResult> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        console.warn("[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification");
        return { ok: true };
    }

    if (!token) return { ok: false, reason: "missing-token" };

    const body = new URLSearchParams({ secret, response: token });
    // Cloudflare scores the token against the IP it was solved from when given
    // one. Only send a real address — "unknown" would be scored as a mismatch.
    if (remoteIp && remoteIp !== "unknown") body.set("remoteip", remoteIp);

    try {
        const res = await fetch(VERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { ok: false, reason: `verify-http-${res.status}` };

        const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
        if (data.success) return { ok: true };
        return { ok: false, reason: (data["error-codes"] ?? ["rejected"]).join(",") };
    } catch {
        // Cloudflare unreachable. Deliberately a FAILURE: the whole point is
        // that this path isn't reachable without passing, and an attacker who
        // can make the check time out shouldn't get a free pass for it. The
        // caller surfaces it as "try again", not as a broken wallet.
        return { ok: false, reason: "verify-unreachable" };
    }
}
