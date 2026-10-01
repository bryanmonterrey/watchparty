import { pgTable, text, timestamp, index, primaryKey, pgPolicy } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { posts } from "./post";

/**
 * Which coins a post tags — written when the post is published, from what the
 * author PICKED in the composer's ticker dropdown.
 *
 * ## Why this table exists rather than a regex over post text
 *
 * Tags were first read by matching `$TICKER` in `posts.content` at query time.
 * That shipped a pattern which matched NOTHING (`\y\$BONK\y` — `\y` asserts a
 * word boundary and `$` is not a word character), and the failure was invisible:
 * a broken matcher and a coin nobody has tagged return the same empty list.
 *
 * A stored reference cannot fail that way. The row exists or it does not, and
 * the chart, the coin table and the post itself all read the same row instead of
 * three places re-deriving it from prose and disagreeing.
 *
 * It is also the only way to be right about WHICH coin. A ticker is not unique —
 * the same symbol is minted on every chain, repeatedly (measured on the live
 * board: eleven distinct mints called `BOT`). Text says "$BOT"; only a picked
 * reference says which one.
 *
 * ## Keyed by (network, tokenAddress), not by a tokens.id FK
 *
 * Most coins tagged here are not ours. `tokens` holds watchparty launches; the
 * board and the coin page are full of external coins that have no row there and
 * never will. The identity every surface already uses is the chain plus the
 * mint, so that is the key — with `tokenId` alongside, populated only when the
 * coin happens to be one of ours.
 */
export const postTags = pgTable(
    "post_tags",
    {
        postId: text("post_id")
            .notNull()
            .references(() => posts.id, { onDelete: "cascade" }),
        /** Chain slug, matching trending_coins.network / coin_trades.network. */
        network: text("network").notNull(),
        /** The mint / contract address. */
        tokenAddress: text("token_address").notNull(),
        /** The ticker AS PICKED, for rendering the chip without a join. */
        symbol: text("symbol").notNull(),
        /** Set only for coins we launched. */
        tokenId: text("token_id"),
        /** Denormalised from the post so the chart can order and anchor without
         *  joining back — this is read once per marker. */
        createdAt: timestamp("created_at").defaultNow().notNull(),
    },
    (t) => [
        // One post tags one coin once. The composer can't add the same ticker
        // twice, and a re-publish must update rather than duplicate.
        primaryKey({ columns: [t.postId, t.network, t.tokenAddress] }),
        // "every tag for this coin, newest first" — the chart and the table.
        index("post_tags_coin_idx").on(t.network, t.tokenAddress, t.createdAt),
        index("post_tags_post_idx").on(t.postId),
        // Server-only: read through postgres (bypasses RLS); the API roles get
        // nothing (db/enable-rls-coin-tables.sql, 2026-10-01).
        pgPolicy("post_tags_deny_direct_access", { for: "all", to: ["authenticated", "anon"], using: sql`false` }),
    ],
).enableRLS();

export type PostTag = typeof postTags.$inferSelect;
