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
import { deriveBitcoin } from "../derive";
import type { FeeEstimate, SendRequest, SendResult } from "./types";

/** Below this, an output costs more to spend than it holds. */
const DUST_LIMIT = BigInt(294);

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
 */
function selectUtxos(utxos: Utxo[], target: bigint, feeRate: number): Selection {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const chosen: Utxo[] = [];
  let total = BigInt(0);

  for (const utxo of sorted) {
    chosen.push(utxo);
    total += BigInt(utxo.value);

    // Assume a change output while checking; drop it below if uneconomical.
    const withChange = BigInt(Math.ceil(estimateVsize(chosen.length, 2) * feeRate));
    if (total >= target + withChange) {
      const change = total - target - withChange;
      if (change >= DUST_LIMIT) return { chosen, fee: withChange, change };

      // Change would be dust — drop the output and give the remainder to the fee.
      const noChange = BigInt(Math.ceil(estimateVsize(chosen.length, 1) * feeRate));
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
  const { fee } = selectUtxos(utxos, BigInt(request.amount), feeRate);
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
  if (request.contract) throw new Error("Bitcoin has no token transfers");

  const derived = deriveBitcoin(seed);
  const payment = p2wpkh(derived.publicKey);
  const from = payment.address!;
  const amount = BigInt(request.amount);
  if (amount <= BigInt(0)) throw new Error("Amount must be positive");

  const [utxos, feeRate] = await Promise.all([getUtxos(from), getFeeRate()]);
  const { chosen, change } = selectUtxos(utxos, amount, feeRate);

  const tx = new Transaction();
  for (const utxo of chosen) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: { script: payment.script, amount: BigInt(utxo.value) },
    });
  }

  tx.addOutputAddress(request.to, amount);
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
