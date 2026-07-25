/**
 * Seeds linked_wallets from the wallet each user already has.
 *
 *   bun run scripts/wallet/backfill-linked-wallets.ts --dry-run
 *   bun run scripts/wallet/backfill-linked-wallets.ts
 *
 * Every user with a `user.wallet_address` gets one linked_wallets row, marked
 * primary. Source is "swig" when that address matches their
 * encrypted_wallets.swig_address, otherwise "extension" — an address the user
 * signed in with and holds the keys to themselves.
 *
 * Additive and idempotent: a user who already has rows is skipped, so an
 * interrupted run just resumes. Nothing is deleted and user.wallet_address is
 * not touched — this only records what is already true.
 */

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { encrypted_wallets, linkedWallets, user } from "@/db/schema";

const DRY_RUN = process.argv.includes("--dry-run");

const users = await db
  .select({ id: user.id, username: user.username, address: user.wallet_address })
  .from(user);

const swigRows = await db
  .select({ user_id: encrypted_wallets.user_id, swig: encrypted_wallets.swig_address })
  .from(encrypted_wallets);
const swigByUser = new Map(swigRows.map((r) => [r.user_id, r.swig]));

const stats = { linked: 0, skipped: 0, noWallet: 0, conflict: 0 };

console.log(`\nlinked_wallets backfill${DRY_RUN ? " (dry run — no writes)" : ""}\n`);

for (const u of users) {
  if (!u.address) {
    stats.noWallet++;
    continue;
  }

  const existing = await db
    .select({ id: linkedWallets.id })
    .from(linkedWallets)
    .where(eq(linkedWallets.user_id, u.id));
  if (existing.length > 0) {
    stats.skipped++;
    continue;
  }

  const source = swigByUser.get(u.id) === u.address ? "swig" : "extension";
  const label = u.username ?? undefined;

  if (DRY_RUN) {
    console.log(`  · ${(u.username ?? u.id.slice(0, 8)).padEnd(16)} ${source}`);
    stats.linked++;
    continue;
  }

  try {
    await db.insert(linkedWallets).values({
      id: nanoid(),
      user_id: u.id,
      address: u.address,
      source,
      label,
      is_primary: true,
    });
    console.log(`  ✓ ${(u.username ?? u.id.slice(0, 8)).padEnd(16)} ${source}`);
    stats.linked++;
  } catch (err: any) {
    // address is globally unique — a collision means two accounts claim the
    // same wallet, which is worth surfacing rather than silently skipping.
    console.log(`  ✗ ${(u.username ?? u.id.slice(0, 8)).padEnd(16)} ${err?.message ?? err}`);
    stats.conflict++;
  }
}

console.log(
  `\n  ${DRY_RUN ? "would link" : "linked"} ${stats.linked}` +
    `  ·  already had rows ${stats.skipped}` +
    `  ·  no wallet ${stats.noWallet}` +
    `  ·  conflicts ${stats.conflict}\n`
);

process.exit(stats.conflict > 0 ? 1 : 0);
