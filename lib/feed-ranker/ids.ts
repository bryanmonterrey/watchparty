import { createHash } from "node:crypto";

// Phoenix consumes numeric uint64 ids (user/post/author), which it hashes into
// its embedding tables. watchparty ids are text nanoids, so we map each string
// to a STABLE uint64 here. The mapping must be deterministic and identical
// everywhere (ranking history, candidates, corpus building) so the same content
// always lands in the same embedding slot.
//
// Method: first 8 bytes of sha1(id), big-endian, as an unsigned 64-bit value.
// Collisions are astronomically unlikely at our scale and harmless (two posts
// sharing a slot just share an embedding, same as Phoenix's own hashing).
//
// Phoenix treats id 0 as padding/absent — we map empty/null ids to 0n and avoid
// emitting 0 for real ids (sha1 yielding exactly 0 is effectively impossible).

export function toNumericId(id: string | null | undefined): bigint {
    const ZERO = BigInt(0);
    if (!id) return ZERO;
    const digest = createHash("sha1").update(id).digest();
    let v = ZERO;
    const EIGHT = BigInt(8);
    for (let i = 0; i < 8; i++) v = (v << EIGHT) | BigInt(digest[i]);
    return v === ZERO ? BigInt(1) : v;
}

/**
 * Phoenix request bodies are JSON; uint64 exceeds JS safe-integer range, so we
 * serialize ids as decimal strings. FastAPI/pydantic coerces them back to int.
 */
export function toNumericIdString(id: string | null | undefined): string {
    return toNumericId(id).toString();
}
