/**
 * Does any existing wallet actually hold funds?
 *
 * Decides whether the `legacy-random` Solana addresses need a funds migration
 * or can simply be regenerated as seed-derived.
 *
 *   bun run scripts/wallet/check-existing-balances.ts
 */

import { db } from "@/db";
import { walletAddresses } from "@/db/schema";
import { getAssetsForChain } from "@/lib/chains/assets";
import { getRpcUrl } from "@/lib/chains/solana/subscriptions/constants";
import { Connection, PublicKey } from "@solana/web3.js";

const rows = await db
  .select({
    user: walletAddresses.user_id,
    kind: walletAddresses.chain_kind,
    address: walletAddresses.address,
  })
  .from(walletAddresses);

const connection = new Connection(getRpcUrl(), "confirmed");
let anyFunds = false;

for (const row of rows) {
  const label = `${row.user.slice(0, 8)} ${row.kind.padEnd(8)}`;
  try {
    if (row.kind === "solana") {
      const lamports = await connection.getBalance(new PublicKey(row.address));
      const tokens = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(row.address),
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      );
      const held = tokens.value.filter(
        (t) => (t.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0) > 0
      ).length;
      const funded = lamports > 0 || held > 0;
      anyFunds ||= funded;
      console.log(`${funded ? "$" : "·"} ${label} ${lamports / 1e9} SOL, ${held} token acct(s)`);
    } else {
      const chain = row.kind === "evm" ? "ethereum" : row.kind === "bitcoin" ? "bitcoin" : "sui";
      const result = await getAssetsForChain(chain as any, row.address);
      const nonZero = result.assets.filter((a) => a.balance > 0);
      anyFunds ||= nonZero.length > 0;
      console.log(
        `${nonZero.length ? "$" : "·"} ${label} ${
          nonZero.length ? nonZero.map((a) => `${a.balance} ${a.symbol}`).join(", ") : "empty"
        }`
      );
    }
  } catch (err: any) {
    console.log(`? ${label} check failed: ${err?.message ?? err}`);
  }
}

console.log(
  anyFunds
    ? "\nFUNDS PRESENT — a legacy Solana address would need a sweep, not a regenerate.\n"
    : "\nAll empty — legacy Solana wallets can simply be regenerated as seed-derived.\n"
);
process.exit(0);
