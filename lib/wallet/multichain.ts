// Persisting the derived multichain address set.
//
// Shared by wallet creation and the backfill script so the two can never drift
// into deriving different addresses for the same phrase.

import { nanoid } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { walletAddresses } from "@/db/schema";
import { deriveAllKeys } from "@/lib/chains/derive";
import { FROST_PATH } from "@/lib/frost/frost-server";
import type { ChainKind } from "@/lib/chains/types";

export interface PersistOptions {
  /**
   * The user's real Solana address — the Swig PDA, not the bare keypair the
   * phrase derives. Signing there goes through FROST/Swig, so the stored
   * address must be the smart wallet the user actually holds funds in.
   */
  solanaAddress?: string;
  /**
   * Path recorded for the Solana row. Wallets created before seeded FROST used
   * a random group key and random swig id, so their Solana address is NOT
   * reachable from the phrase — those get LEGACY_SOLANA_PATH to record that
   * honestly rather than implying a derivation that doesn't exist.
   */
  solanaDerivationPath?: string;
}

/** Marker for a Solana address that predates seeded FROST and cannot be re-derived. */
export const LEGACY_SOLANA_PATH = "legacy-random";

export interface PersistedAddress {
  kind: ChainKind;
  address: string;
  derivationPath: string;
}

/**
 * Derive every chain address from `seed` and upsert them for `userId`.
 *
 * Idempotent: re-running with the same seed rewrites the same values, so it is
 * safe to call on every wallet open or to resume a half-finished backfill.
 */
export async function persistDerivedAddresses(
  userId: string,
  seed: Uint8Array,
  options: PersistOptions = {}
): Promise<PersistedAddress[]> {
  const rows = buildAddressRows(seed, options);

  await db
    .insert(walletAddresses)
    .values(
      rows.map((row) => ({
        id: nanoid(),
        user_id: userId,
        chain_kind: row.kind,
        address: row.address,
        derivation_path: row.derivationPath,
      }))
    )
    .onConflictDoUpdate({
      target: [walletAddresses.user_id, walletAddresses.chain_kind],
      set: {
        address: sqlExcluded("address"),
        derivation_path: sqlExcluded("derivation_path"),
      },
    });

  return rows;
}

/**
 * Pure address set for a seed — no DB. Useful for dry runs and for showing a
 * user what their phrase resolves to before anything is written.
 */
export function buildAddressRows(
  seed: Uint8Array,
  options: PersistOptions = {}
): PersistedAddress[] {
  return deriveAllKeys(seed).map((key) => {
    if (key.kind === "solana") {
      return {
        kind: key.kind,
        // The Swig PDA is the address; the phrase reaches it via the FROST
        // group key at FROST_PATH plus the seeded swig id.
        address: options.solanaAddress ?? key.address,
        derivationPath:
          options.solanaDerivationPath ??
          (options.solanaAddress ? FROST_PATH : key.derivationPath),
      };
    }
    return { kind: key.kind, address: key.address, derivationPath: key.derivationPath };
  });
}

/** Read back a user's stored addresses, keyed by chain kind. */
export async function getAddressesByKind(
  userId: string
): Promise<Partial<Record<ChainKind, string>>> {
  const rows = await db
    .select({ kind: walletAddresses.chain_kind, address: walletAddresses.address })
    .from(walletAddresses)
    .where(eq(walletAddresses.user_id, userId));

  const out: Partial<Record<ChainKind, string>> = {};
  for (const row of rows) out[row.kind as ChainKind] = row.address;
  return out;
}

// Postgres exposes the would-be-inserted row as `excluded` inside DO UPDATE.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}
