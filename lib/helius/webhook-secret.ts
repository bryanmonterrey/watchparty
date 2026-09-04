// The ONE place the Helius webhook auth header is decided.
//
// `HELIUS_WEBHOOK_SECRET_V2` wins when set; `HELIUS_WEBHOOK_SECRET` is the
// original. The second name exists because of 2026-09-04: the Helius KEY was
// rotated on 2026-08-09 but the webhook SECRET was not, so when the OLD
// account's webhook came back it still passed every receiver's auth check,
// and its ~1,400 deliveries/min did real work until the container hit its
// 4,096-connection ceiling. A secret we do not accept turns that into a 401
// in microseconds, which is the whole defence against a webhook we cannot
// delete.
//
// Why a NEW name rather than a new value: production env is assembled from
// two GitHub secrets that cannot be read back, so an existing key cannot be
// edited in place — but `wrangler secret put` of a key that is in neither
// file survives every deploy (bulk upload only sets what it lists).
//
// Receivers accept ONLY the current value — never both — otherwise rotating
// changes nothing. The three sync jobs re-register every webhook with the
// current value on their next run (`webhookIsCurrent` compares it).

export function heliusWebhookSecret(): string | undefined {
    return process.env.HELIUS_WEBHOOK_SECRET_V2 || process.env.HELIUS_WEBHOOK_SECRET || undefined;
}

/** True when no secret is configured (dev) or the header matches the current one. */
export function isAuthorizedHeliusRequest(req: { headers: { get(name: string): string | null } }): boolean {
    const secret = heliusWebhookSecret();
    if (!secret) return true;
    return req.headers.get("authorization") === secret;
}
