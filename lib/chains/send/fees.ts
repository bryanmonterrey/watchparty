// The platform send fee on EVM chains (lib/chains/fee-bps.ts): accrue now, sweep later.
//
// Every other chain takes the fee inside the user's own transaction — Solana
// adds an instruction, Bitcoin adds an output. An EVM transfer pays exactly one
// address, so the only ways to charge in-transaction are a fee-splitter
// contract on all five chains or a second transaction per send (double gas, and
// real money on mainnet).
//
// So the send stays one plain transfer at normal gas and the fee is recorded as
// owed. app/api/cron/send-fee-sweep collects it: one transaction per
// (wallet, chain, token) per run instead of one per send.
//
// Accrual is deliberately best-effort at the call site — see accrueSendFee.

import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sendFeeAccruals } from "@/db/schema";
import { getChain } from "../registry";
import { PLATFORM_FEE_BPS_BIG } from "../fee-bps";

/** Matches the Solana and Bitcoin send paths — see lib/chains/fee-bps.ts. */
export const SEND_FEE_BPS = PLATFORM_FEE_BPS_BIG;

/** Fees are charged on top of the amount, so the recipient always stays whole. */
export function sendFeeFor(amountBaseUnits: string): bigint {
  return (BigInt(amountBaseUnits) * SEND_FEE_BPS) / BigInt(10_000);
}

/** Only the chains that can't take the fee in-transaction accrue it. */
export function accruesFee(chainId: string): boolean {
  return getChain(chainId)?.kind === "evm";
}

/**
 * Record the fee owed on a completed send.
 *
 * Never throws. The transfer has already landed on-chain by the time this runs,
 * and failing the user's request after their money moved — to report a
 * bookkeeping error they can do nothing about — would be worse than an
 * uncollected fee. Failures are logged for reconciliation instead.
 */
export async function accrueSendFee(args: {
  userId: string;
  chain: string;
  contract?: string;
  amount: string;
  sourceTx?: string;
}): Promise<void> {
  if (!accruesFee(args.chain)) return;

  const fee = sendFeeFor(args.amount);
  if (fee <= BigInt(0)) return;

  try {
    await db.insert(sendFeeAccruals).values({
      id: nanoid(),
      user_id: args.userId,
      chain: args.chain,
      contract: args.contract ?? null,
      amount: fee.toString(),
      source_tx: args.sourceTx ?? null,
    });
  } catch (err) {
    console.error("accrueSendFee failed — fee uncollected", {
      userId: args.userId,
      chain: args.chain,
      contract: args.contract,
      fee: fee.toString(),
      sourceTx: args.sourceTx,
      err,
    });
  }
}

export interface PendingFeeGroup {
  userId: string;
  chain: string;
  contract: string | null;
  /** Summed base units owed for this (user, chain, token). */
  total: bigint;
  ids: string[];
}

/**
 * Pending fees, grouped into one sweep transaction each.
 *
 * Grouping is what makes this cheaper than charging per send: a user who made
 * twenty Base USDC transfers owes one transaction, not twenty.
 */
export async function pendingFeeGroups(limit = 500): Promise<PendingFeeGroup[]> {
  const rows = await db
    .select({
      id: sendFeeAccruals.id,
      userId: sendFeeAccruals.user_id,
      chain: sendFeeAccruals.chain,
      contract: sendFeeAccruals.contract,
      amount: sendFeeAccruals.amount,
    })
    .from(sendFeeAccruals)
    .where(eq(sendFeeAccruals.status, "pending"))
    .limit(limit);

  const groups = new Map<string, PendingFeeGroup>();
  for (const row of rows) {
    const key = `${row.userId}:${row.chain}:${row.contract ?? "native"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.total += BigInt(row.amount);
      existing.ids.push(row.id);
    } else {
      groups.set(key, {
        userId: row.userId,
        chain: row.chain,
        contract: row.contract,
        total: BigInt(row.amount),
        ids: [row.id],
      });
    }
  }
  return [...groups.values()];
}

export async function markSwept(ids: string[], txId: string): Promise<void> {
  for (const id of ids) {
    await db
      .update(sendFeeAccruals)
      .set({ status: "swept", swept_tx: txId, swept_at: new Date(), last_error: null })
      .where(and(eq(sendFeeAccruals.id, id), eq(sendFeeAccruals.status, "pending")));
  }
}

/**
 * Leave the rows pending and record why.
 *
 * An empty gas balance is the normal case and it resolves itself — the next run
 * retries. Marking them "failed" would quietly write the fee off.
 */
export async function markSweepFailed(ids: string[], reason: string): Promise<void> {
  for (const id of ids) {
    await db
      .update(sendFeeAccruals)
      .set({ last_error: reason.slice(0, 500) })
      .where(and(eq(sendFeeAccruals.id, id), eq(sendFeeAccruals.status, "pending")));
  }
}
