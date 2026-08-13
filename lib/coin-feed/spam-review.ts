/**
 * Ask a model what the deterministic spam rules MISSED.
 *
 * `quality.ts` can only catch patterns somebody already wrote down, and twice
 * the writing-down happened late and by hand:
 *
 *   2026-08-07  $CLAUDE / $ANTHROPIC reached the alert rail    -> BRAND_TERMS
 *   2026-08-10  HOOD + NVDA held 49 of 300 watch-list slots    -> BRAND_WORDS
 *   2026-08-11  SNDK, AMD, UNITREE — found by THIS             -> both
 *
 * ## The model PROPOSES. It never disposes.
 *
 * This returns suspects and suggested rule additions. It does not gate, hide or
 * delete a coin, and nothing downstream should let it. The split is deliberate:
 * this feeds a money surface, where a rule must be auditable ("SNDK is
 * SanDisk's ticker") and reproducible on the same input. A model's verdict is
 * neither — and `securityScore` is the standing reminder of what an unexamined
 * signal does here, having read 0 for healthy coins and rejected 20 of 20.
 *
 * Shared by `scripts/coin-feed/audit-spam.ts` and the admin panel so the two
 * cannot drift. Takes rows rather than querying, because the script reads
 * through postgres.js and the router through drizzle.
 */

import { isBrandSquat, clearsBrandBar, BRAND_SQUAT_MIN_LIQUIDITY_USD } from "./quality";

export interface ReviewCandidate {
    network: string;
    tokenAddress: string;
    symbol: string;
    name: string | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    imageUrl: string | null;
}

export interface SpamSuspect {
    candidate: ReviewCandidate;
    reason: string;
    impersonates: string | null;
    confidence: "high" | "medium" | "low";
    /** Below the brand bar, so RECOGNISING the name rejects it outright rather
     *  than merely holding it to a higher bar. The HOOD case. */
    belowBrandBar: boolean;
}

export interface SpamReview {
    /** Coins considered (already narrowed to a time window by the caller). */
    total: number;
    /** Rejected by the existing brand bar before the model saw them. */
    rejectedByBar: number;
    /** Reviewed — i.e. the rules let these through. */
    reviewed: number;
    /**
     * Flagged AND invisible to `isBrandSquat`. The actual finding: the gate
     * cannot see these at all.
     */
    invisible: SpamSuspect[];
    /**
     * Flagged but already recognised, admitted on liquidity. The brand bar is a
     * high bar, not a ban, so this is the gate WORKING — kept separate because
     * listing it beside real misses makes a healthy run look like a failure and
     * trains you to ignore the report.
     */
    known: SpamSuspect[];
    /** Proposed additions, already filtered to what the gate does not know. */
    proposedTerms: string[];
    proposedWords: string[];
}

const SYSTEM = `You review newly-listed crypto tokens for a discovery feed and report which look like spam.

The strongest signal is IMPERSONATION: a token riding a well-known company, product, person or stock ticker it has no connection to. Stock tickers matter as much as names (HOOD is Robinhood, NVDA is Nvidia, MSTR is MicroStrategy).

Judge ONLY from the symbol and name. Liquidity and volume are context for how established a token is, never evidence that it is legitimate — a rug pumps volume cheaply.

Be conservative. An ordinary meme coin with a silly name is NOT spam; crypto-native vocabulary (coin, moon, pepe, dog, inu) is normal. Flag impersonation, deceptive claims of official status, and obvious scam patterns.

Reply with ONLY a JSON object:
{"suspects":[{"id":1,"reason":"...","impersonates":"...","confidence":"high|medium|low"}],"suggestedBrandTerms":["..."],"suggestedBrandWords":["..."]}

"id" is the number of the token in the list. List each token AT MOST ONCE. Different tokens can share a symbol — they are separate entries with separate ids, so use the id, and never emit an entry whose only content is that it duplicates another.

suggestedBrandTerms: distinctive brand NAMES safe to match as a substring.
suggestedBrandWords: short tokens/tickers that MUST match on word boundaries because they appear inside ordinary words. Never suggest an ordinary English or crypto word (coin, meta, moon) — it would fail real tokens.
Both lists lowercase. Empty arrays are a fine answer.`;

const usd = (n: number | null) => (n == null ? "?" : `$${Math.round(n).toLocaleString()}`);

/**
 * @returns null when Workers AI is unreachable or answers unusably. Callers
 *   surface that as "couldn't review", never as "nothing found" — a silent
 *   empty result would read as a clean bill of health.
 */
export async function reviewCoinSpam(candidates: readonly ReviewCandidate[]): Promise<SpamReview | null> {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!account || !token) return null;

    // Only what the EXISTING rules let through. Reviewing the rejects measures
    // the gate; the misses are the point.
    const reviewed = candidates.filter((c) => clearsBrandBar(c.symbol, c.name, c.liquidityUsd, false, c.tokenAddress));
    const base = {
        total: candidates.length,
        rejectedByBar: candidates.length - reviewed.length,
        reviewed: reviewed.length,
    };
    if (!reviewed.length) {
        return { ...base, invisible: [], known: [], proposedTerms: [], proposedWords: [] };
    }

    const catalogue = reviewed
        .map(
            (c, i) =>
                `${i + 1}. ${c.symbol} — "${c.name ?? ""}" [${c.network}] ` +
                `liquidity ${usd(c.liquidityUsd)}, 24h volume ${usd(c.volume24hUsd)}` +
                `${c.imageUrl ? "" : ", NO IMAGE"}`,
        )
        .join("\n");

    let raw = "";
    try {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1/chat/completions`,
            {
                method: "POST",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify({
                    model: process.env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2",
                    messages: [
                        { role: "system", content: SYSTEM },
                        { role: "user", content: `Review these ${reviewed.length} tokens:\n\n${catalogue}` },
                    ],
                    response_format: { type: "json_object" },
                    // GLM-5.2 is a REASONING model: chain-of-thought and answer
                    // share one budget, and too small a cap yields an EMPTY
                    // reply rather than a short one (CLAUDE.md).
                    max_tokens: 8000,
                }),
                signal: AbortSignal.timeout(60_000),
            },
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        raw = body.choices?.[0]?.message?.content ?? "";
    } catch {
        return null;
    }

    let parsed: {
        suspects?: { id?: number; reason?: string; impersonates?: string; confidence?: string }[];
        suggestedBrandTerms?: string[];
        suggestedBrandWords?: string[];
    };
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    // KEYED ON THE CATALOGUE INDEX, never the symbol. Symbols are NOT unique —
    // the first run of this surfaced three separate SNDK tokens at three
    // addresses, and matching by symbol reported all three with the first one's
    // liquidity and address. Deduping on `id` also drops the "duplicate of the
    // above" entries the model emits when it sees a symbol twice.
    const seen = new Set<number>();
    const suspects: SpamSuspect[] = [];
    for (const s of parsed.suspects ?? []) {
        if (typeof s.id !== "number" || seen.has(s.id)) continue;
        const candidate = reviewed[s.id - 1];
        if (!candidate) continue;
        seen.add(s.id);
        const c = s.confidence === "high" || s.confidence === "medium" ? s.confidence : "low";
        suspects.push({
            candidate,
            reason: typeof s.reason === "string" ? s.reason : "",
            impersonates: typeof s.impersonates === "string" ? s.impersonates : null,
            confidence: c,
            belowBrandBar: (candidate.liquidityUsd ?? 0) < BRAND_SQUAT_MIN_LIQUIDITY_USD,
        });
    }

    // Suggestions the gate already covers are noise, and the check runs through
    // the REAL predicate rather than re-reading the arrays.
    const fresh = (xs: string[] | undefined) =>
        (xs ?? []).filter((x) => typeof x === "string" && x.trim() && !isBrandSquat(x, x)).map((x) => x.trim());

    return {
        ...base,
        invisible: suspects.filter((s) => !isBrandSquat(s.candidate.symbol, s.candidate.name)),
        known: suspects.filter((s) => isBrandSquat(s.candidate.symbol, s.candidate.name)),
        proposedTerms: fresh(parsed.suggestedBrandTerms),
        proposedWords: fresh(parsed.suggestedBrandWords),
    };
}
