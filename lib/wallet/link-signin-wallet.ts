import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { linkedWallets, type LinkedWalletChainKind } from "@/db/schema/auth/linked-wallets";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Base58 vs hex is enough to tell them apart at a sign-in boundary. */
export function chainKindOfAddress(address: string): LinkedWalletChainKind {
  return EVM_ADDRESS.test(address) ? "evm" : "solana";
}

/**
 * Record the wallet someone just signed in with as one of their wallets.
 *
 * The wallet they authenticated with IS a wallet — that was the gap. Signing in
 * with Base created an account with no wallet at all, because `user.wallet_address`
 * is the Solana mirror and an EVM address must not go in it, so nothing was
 * written anywhere and the account picker had nothing to show.
 *
 * Two rules, both deliberate:
 *
 *  - It becomes the wallet IN USE only if the account has none. Signing in with
 *    a wallet you already linked must not silently promote it over the one you
 *    chose — switching primary is an explicit action elsewhere. But an account
 *    whose first and only wallet is the one they just used has an obvious
 *    answer, and leaving it unset is what produced the empty picker.
 *  - Best-effort. This is bookkeeping hanging off a successful signature; a
 *    failure here must not turn a valid sign-in into a failed one.
 *
 * `linked_wallets.address` is globally unique (a wallet belongs to exactly one
 * account), so an address already present is either this user's — nothing to do
 * — or evidence that sign-in resolved to the wrong account, which is worth a log
 * rather than an insert that would throw.
 */
export async function linkSignInWallet(
  userId: string,
  address: string,
  /**
   * The EVM chain the SIWE message was signed on (8453 = Base). Recorded
   * because nothing about the address can recover it later — one secp256k1
   * address is the same account on every EVM chain. It is a fallback hint for
   * the balance chip, which otherwise resolves the chain from where the user
   * actually holds value.
   */
  chainId?: number | null,
): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: linkedWallets.id, userId: linkedWallets.user_id })
      .from(linkedWallets)
      .where(eq(linkedWallets.address, address))
      .limit(1);

    if (existing) {
      if (existing.userId !== userId) {
        console.error("[wallet] signed-in wallet belongs to another account", { userId, owner: existing.userId });
      }
      return;
    }

    const [primary] = await db
      .select({ id: linkedWallets.id })
      .from(linkedWallets)
      .where(and(eq(linkedWallets.user_id, userId), eq(linkedWallets.is_primary, true)))
      .limit(1);

    await db.insert(linkedWallets).values({
      id: nanoid(),
      user_id: userId,
      address,
      source: "extension",
      chain_kind: chainKindOfAddress(address),
      chain_id: chainId ?? null,
      is_primary: !primary,
    });
  } catch (err) {
    // `.cause` carries the real driver message; drizzle surfaces only "Failed query".
    console.error("[wallet] linkSignInWallet failed:", err, (err as { cause?: unknown })?.cause ?? "");
  }
}
