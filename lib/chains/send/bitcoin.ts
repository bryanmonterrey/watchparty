// Bitcoin transfers — UTXO selection, fee estimation, PSBT signing, broadcast.
//
// UTXO chains are unlike account chains: there is no "balance" to debit, only
// unspent outputs to consume whole. Anything left over must be sent back to
// yourself as change, and forgetting that output donates the remainder to
// miners. That is the single most expensive mistake available here, so the
// change path below is explicit.

import { Transaction, p2wpkh } from "@scure/btc-signer";
import { hex } from "@scure/base";
import { BITCOIN } from "../registry";
import { isAddressFormat } from "../address";
import { deriveBitcoin } from "../derive";
import type { FeeEstimate, SendRequest, SendResult } from "./types";
import { PLATFORM_FEE_BPS_BIG } from "../fee-bps";
import { treasuryBtcAddress } from "../treasury";

/** Below this, an output costs more to spend than it holds. */
const DUST_LIMIT = BigInt(294);

/** Matches the Solana send path. */
const PLATFORM_FEE_BPS = PLATFORM_FEE_BPS_BIG;

/**
 * The platform fee, taken as one more output in the same transaction rather
 * than a second transaction — a UTXO tx pays as many recipients as it likes,
 * and an extra output costs 31 vBytes (see estimateVsize) instead of a whole
 * second transaction's overhead.
 *
 * Returns 0 when the address is malformed or the fee would be a dust output —
 * an unspendable output is worse than an uncollected fee, and neither is worth
 * failing the user's send over.
 */
export function platformFeeFor(amount: bigint): { fee: bigint; treasury?: string } {
  const treasury = treasuryBtcAddress();
  if (!isAddressFormat("bitcoin", treasury)) {
    console.warn("TREASURY_BTC_ADDRESS is not a valid Bitcoin address — fee skipped");
    return { fee: BigInt(0) };
  }
  const fee = (amount * PLATFORM_FEE_BPS) / BigInt(10_000);
  return fee >= DUST_LIMIT ? { fee, treasury } : { fee: BigInt(0) };
}

interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

async function api<T>(path: string, apiBase = BITCOIN.rpcUrl!): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`mempool.space ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getUtxos(address: string, apiBase = BITCOIN.rpcUrl!): Promise<Utxo[]> {
  const utxos = await api<Utxo[]>(`/address/${address}/utxo`, apiBase);
  // Unconfirmed inputs can be invalidated by a reorg of the parent tx.
  return utxos.filter((u) => u.status.confirmed);
}

export async function getFeeRate(apiBase = BITCOIN.rpcUrl!): Promise<number> {
  try {
    const fees = await api<{ halfHourFee: number }>("/v1/fees/recommended", apiBase);
    return fees.halfHourFee;
  } catch {
    return 10; // sat/vB fallback — better to overpay slightly than to stick.
  }
}

/** P2WPKH virtual size: overhead + per-input + per-output. */
function estimateVsize(inputs: number, outputs: number): number {
  return Math.ceil(10.5 + 68 * inputs + 31 * outputs);
}

interface Selection {
  chosen: Utxo[];
  fee: bigint;
  change: bigint;
}

/**
 * Largest-first accumulation. Re-checks the fee after each pick because adding
 * an input raises the fee, which can undo a selection that just barely covered.
 *
 * `target` is everything being paid out (amount plus any platform fee), and
 * `extraOutputs` is how many outputs beyond recipient+change the transaction
 * carries — the miner fee scales with output count, so a selection that ignored
 * the fee output would come up short by exactly its 31 vBytes.
 */
export function selectUtxos(
  utxos: Utxo[],
  target: bigint,
  feeRate: number,
  extraOutputs = 0
): Selection {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const chosen: Utxo[] = [];
  let total = BigInt(0);

  for (const utxo of sorted) {
    chosen.push(utxo);
    total += BigInt(utxo.value);

    // Assume a change output while checking; drop it below if uneconomical.
    const withChange = BigInt(
      Math.ceil(estimateVsize(chosen.length, 2 + extraOutputs) * feeRate)
    );
    if (total >= target + withChange) {
      const change = total - target - withChange;
      if (change >= DUST_LIMIT) return { chosen, fee: withChange, change };

      // Change would be dust — drop the output and give the remainder to the fee.
      const noChange = BigInt(
        Math.ceil(estimateVsize(chosen.length, 1 + extraOutputs) * feeRate)
      );
      if (total >= target + noChange) {
        return { chosen, fee: total - target, change: BigInt(0) };
      }
    }
  }

  throw new Error("Insufficient confirmed balance to cover amount plus fee");
}

export async function estimateBitcoinFee(
  address: string,
  request: SendRequest
): Promise<FeeEstimate> {
  const [utxos, feeRate] = await Promise.all([getUtxos(address), getFeeRate()]);
  const amount = BigInt(request.amount);
  // Quote the transaction that will actually be built, fee output included.
  const platform = platformFeeFor(amount);
  const { fee } = selectUtxos(
    utxos,
    amount + platform.fee,
    feeRate,
    platform.fee > BigInt(0) ? 1 : 0
  );
  return {
    fee: fee.toString(),
    feeFormatted: Number(fee) / 10 ** BITCOIN.nativeCurrency.decimals,
    symbol: BITCOIN.nativeCurrency.symbol,
  };
}

export async function sendBitcoin(
  seed: Uint8Array,
  request: SendRequest
): Promise<SendResult> {
  if (request.contract) throw new Error("Bitcoin has no coin transfers");

  const derived = deriveBitcoin(seed);
  const payment = p2wpkh(derived.publicKey);
  const from = payment.address!;
  const amount = BigInt(request.amount);
  if (amount <= BigInt(0)) throw new Error("Amount must be positive");

  const [utxos, feeRate] = await Promise.all([getUtxos(from), getFeeRate()]);
  const platform = platformFeeFor(amount);
  const { chosen, change } = selectUtxos(
    utxos,
    amount + platform.fee,
    feeRate,
    platform.fee > BigInt(0) ? 1 : 0
  );

  const tx = new Transaction();
  for (const utxo of chosen) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: payment.script, amount: BigInt(utxo.value) },
    });
  }

  tx.addOutputAddress(request.to, amount);
  // The platform fee rides along as its own output — the recipient still
  // receives the full amount, and the sender covers the fee.
  if (platform.fee > BigInt(0) && platform.treasury) {
    tx.addOutputAddress(platform.treasury, platform.fee);
  }
  // The change output. Omitted only when selectUtxos decided it would be dust.
  if (change > BigInt(0)) tx.addOutputAddress(from, change);

  tx.sign(derived.privateKey);
  tx.finalize();

  const rawHex = hex.encode(tx.extract());
  const res = await fetch(`${BITCOIN.rpcUrl}/tx`, { method: "POST", body: rawHex });
  if (!res.ok) throw new Error(`Broadcast failed: ${await res.text()}`);

  const txId = (await res.text()).trim();
  return { txId, explorerUrl: `${BITCOIN.explorer}/tx/${txId}` };
}
