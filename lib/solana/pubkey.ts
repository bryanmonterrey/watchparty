import { PublicKey } from "@solana/web3.js";

// PublicKey helpers live here — NOT in lib/utils — so the universal cn()/format
// module never drags @solana/web3.js into every chunk (it was costing every
// server route and Worker isolate the whole web3.js graph).

// Build a PublicKey WITHOUT throwing on bad input — returns null for
// null/empty/non-base58 strings. Use this anywhere a PublicKey is constructed
// during render (a thrown `new PublicKey()` in render is uncaught and takes the
// whole page down — e.g. a user signed in without a wallet whose stored address
// isn't valid base58).
export function toPublicKey(value: PublicKey | string | null | undefined): PublicKey | null {
    if (!value) return null;
    if (typeof value !== "string") return value;
    try {
        return new PublicKey(value);
    } catch {
        return null;
    }
}
