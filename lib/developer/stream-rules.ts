// The filtered-stream rule engine (Phase 9). X's Streaming Rules model, adapted
// to watchparty's STRUCTURED own-account events (stream.online, coin.launched,
// prediction.resolved, …) instead of tweets. Pure logic — no DB, no network — so
// it lives here, is unit-tested (tests/developer-stream-rules.test.ts), and can
// be called from both the rule CRUD (validate at write time) and, later, the
// delivery transport (filter the event bus before an SSE/DO push).
//
// Grammar (a deliberately bounded subset of X's):
//   rule   = term (WS term)*          — terms are AND'd
//   term   = ["-"] (operator | word)  — leading "-" negates
//   operator = field ":" value        — field is a bareword; exact, case-insensitive
//   word     = keyword                — case-insensitive substring over the event text
//   value/word may be "quoted" to include spaces.
// An account's rules are OR'd: an event delivers if ANY rule matches, carrying
// that rule's tag (X-style).
//
// THE load-bearing validity rule (kept from X, and it's a metering safeguard,
// not a nicety): a rule MUST contain at least one POSITIVE (non-negated) term.
// A rule of only negations matches the entire firehose — exactly the unbounded
// cost the Helius lesson warns against — so it fails closed at write time AND is
// skipped at match time as defense-in-depth.

export type RuleTerm = {
    negate: boolean;
    /** Operator field (lower-cased), or null for a bare keyword. */
    field: string | null;
    /** Comparand, lower-cased. */
    value: string;
};

export type ParsedRule = { terms: RuleTerm[] };

export const MAX_RULE_LEN = 512;
export const MAX_RULE_TERMS = 32;

/** Split on whitespace, but keep "quoted phrases" (incl. field:"a b") intact. */
function tokenize(value: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    const n = value.length;
    while (i < n) {
        while (i < n && /\s/.test(value[i])) i++;
        if (i >= n) break;
        let tok = "";
        while (i < n && !/\s/.test(value[i])) {
            if (value[i] === '"') {
                tok += value[i++]; // opening quote
                while (i < n && value[i] !== '"') tok += value[i++];
                if (i < n) tok += value[i++]; // closing quote
            } else {
                tok += value[i++];
            }
        }
        tokens.push(tok);
    }
    return tokens;
}

function stripQuotes(s: string): string {
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    return s;
}

function parseTerm(raw: string): RuleTerm | null {
    let tok = raw;
    let negate = false;
    if (tok.startsWith("-")) {
        negate = true;
        tok = tok.slice(1);
    }
    if (!tok) return null;

    let field: string | null = null;
    let value = tok;
    const colon = tok.indexOf(":");
    if (colon > 0) {
        const maybeField = tok.slice(0, colon);
        // Only a bareword before the colon is an operator; otherwise the token is
        // a plain keyword (so "12:30" or a URL isn't misread as field:value).
        if (/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(maybeField)) {
            field = maybeField.toLowerCase();
            value = tok.slice(colon + 1);
        }
    }
    value = stripQuotes(value).toLowerCase();
    if (!value) return null;
    return { negate, field, value };
}

export function parseRule(value: string): ParsedRule {
    const terms: RuleTerm[] = [];
    for (const t of tokenize(value).slice(0, MAX_RULE_TERMS)) {
        const term = parseTerm(t);
        if (term) terms.push(term);
    }
    return { terms };
}

export type RuleValidation = { ok: true } | { ok: false; error: string };

export function validateRule(value: string): RuleValidation {
    const trimmed = value.trim();
    if (!trimmed) return { ok: false, error: "Rule is empty" };
    if (trimmed.length > MAX_RULE_LEN) {
        return { ok: false, error: `Rule exceeds ${MAX_RULE_LEN} characters` };
    }
    const parsed = parseRule(trimmed);
    if (parsed.terms.length === 0) return { ok: false, error: "Rule has no valid terms" };
    if (!parsed.terms.some((t) => !t.negate)) {
        return {
            ok: false,
            error: "A rule needs at least one positive term — a rule of only negations would match every event.",
        };
    }
    return { ok: true };
}

/** The event's searchable text: every non-null field value, space-joined, lower. */
export function eventSearchText(event: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const v of Object.values(event)) {
        if (v == null) continue;
        parts.push(String(v));
    }
    return parts.join(" ").toLowerCase();
}

/** Case-insensitive field lookup → lower-cased string value, or null. */
function fieldValue(event: Record<string, unknown>, field: string): string | null {
    for (const [k, v] of Object.entries(event)) {
        if (k.toLowerCase() === field && v != null) return String(v).toLowerCase();
    }
    return null;
}

function termMatches(term: RuleTerm, event: Record<string, unknown>, text: string): boolean {
    let hit: boolean;
    if (term.field) {
        const fv = fieldValue(event, term.field);
        hit = fv !== null && fv === term.value;
    } else {
        hit = text.includes(term.value);
    }
    return term.negate ? !hit : hit;
}

/** Does one parsed rule match an event? (AND of its terms.) */
export function matchEvent(rule: ParsedRule, event: Record<string, unknown>): boolean {
    // Fail closed on an invalid rule: no terms, or all-negation (would match the
    // whole firehose). validateRule blocks these at write time; this is the
    // match-time backstop for anything already stored.
    if (rule.terms.length === 0 || !rule.terms.some((t) => !t.negate)) return false;
    const text = eventSearchText(event);
    return rule.terms.every((t) => termMatches(t, event, text));
}

/** For a set of stored rules, the tags whose rule matches this event (OR set). */
export function matchingTags(
    rules: { value: string; tag: string | null }[],
    event: Record<string, unknown>,
): string[] {
    const text = eventSearchText(event);
    const tags: string[] = [];
    for (const r of rules) {
        const parsed = parseRule(r.value);
        if (parsed.terms.length === 0 || !parsed.terms.some((t) => !t.negate)) continue;
        if (parsed.terms.every((t) => termMatches(t, event, text))) {
            tags.push(r.tag ?? r.value);
        }
    }
    return tags;
}
