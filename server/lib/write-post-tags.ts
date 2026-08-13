import "server-only";

import { z } from "zod";
import { db } from "@/db";
import { postTags } from "@/db/schema/content/post-tag";

/**
 * The wire shape: coins a post tags, as picked in the composer's `$` dropdown.
 * Declared beside the writer so the validation and the insert cannot drift.
 */
export const postTagsInput = z
    .array(
        z.object({
            network: z.string().max(32),
            tokenAddress: z.string().min(1).max(80),
            symbol: z.string().min(1).max(24),
            tokenId: z.string().max(64).nullish(),
        }),
    )
    .max(10)
    .optional();

/** One coin a post tags, as picked in the composer. */
export interface PickedTagInput {
    network: string;
    tokenAddress: string;
    symbol: string;
    tokenId?: string | null;
}

/**
 * Store the coins a post tags.
 *
 * Written WITH the post rather than derived from its text later — that is the
 * whole design (db/schema/content/post-tag): a stored reference cannot silently
 * fail to match the way a regex over prose can, and it settles which of the
 * several coins sharing a ticker was meant.
 *
 * Best-effort by construction. A tag that fails to store must not cost the
 * author the post they just wrote, so this never throws — the post is the thing
 * with value, the tag is an annotation on it.
 */
export async function writePostTags(postId: string, tags: readonly PickedTagInput[]): Promise<number> {
    // De-duped because (post_id, network, token_address) is the PRIMARY KEY and
    // a duplicate WITHIN one insert throws outright rather than being ignored
    // by onConflictDoNothing.
    const seen = new Set<string>();
    const rows = tags
        .filter((t) => {
            if (!t.network || !t.tokenAddress || !t.symbol) return false;
            const k = `${t.network}:${t.tokenAddress}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        })
        .map((t) => ({
            postId,
            network: t.network,
            tokenAddress: t.tokenAddress,
            symbol: t.symbol.replace(/^\$/, ""),
            tokenId: t.tokenId ?? null,
        }));
    if (!rows.length) return 0;

    try {
        await db.insert(postTags).values(rows).onConflictDoNothing();
        return rows.length;
    } catch (err) {
        console.error("[post-tags] write failed:", err instanceof Error ? err.message : err);
        return 0;
    }
}
