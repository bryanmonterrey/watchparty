// Sui transfers.
//
// TEMPORARILY DISABLED — and the reason matters for whoever picks this up.
//
// This was implemented with @mysten/sui, which is 8.2 MB and lands in the
// server bundle through send/index.ts → the tRPC router → handler.mjs. That
// pushed the Cloudflare Worker past its 10 MiB limit and broke every deploy
// (code 10027) until it was removed. Do NOT re-add the SDK import here.
//
// The correct fix is to build the transfer without the SDK:
//   1. suix_getCoins over plain JSON-RPC to pick a coin,
//   2. unsafe_transferSui (or unsafe_paySui) to have the fullnode BUILD the
//      transaction and hand back txBytes — this avoids pulling in the BCS
//      serializer, which is the heaviest part of the SDK,
//   3. sign blake2b256(intent ‖ txBytes) with ed25519 — @noble/curves and
//      @noble/hashes are already bundled — formatting the signature as
//      flag(0x00) ‖ sig(64) ‖ pubkey(32), base64,
//   4. submit via sui_executeTransactionBlock.
//
// That path needs an on-chain test with real SUI before it ships; shipping
// untested fund-moving code is worse than a clearly disabled button.
//
// Sui BALANCES and ACTIVITY are unaffected — both already use raw JSON-RPC
// (lib/chains/assets/sui.ts, lib/chains/activity/sui.ts) with no SDK.

import { SUI } from "../registry";
import type { FeeEstimate, SendRequest, SendResult } from "./types";

export const SUI_SEND_UNAVAILABLE =
  "Sui sending is temporarily unavailable. Receiving and balances work as normal.";

/**
 * Basic shape check: 0x followed by 64 hex chars. Kept local so the send
 * router can still validate a Sui address without importing the SDK.
 */
export function validateSuiAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(address);
}

export async function estimateSuiFee(): Promise<FeeEstimate> {
  // Reference gas price is a plain JSON-RPC call, so quoting still works.
  const res = await fetch(SUI.rpcUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getReferenceGasPrice", params: [] }),
  });
  if (!res.ok) throw new Error(`sui rpc returned ${res.status}`);
  const body = (await res.json()) as { result?: string };

  const gasPrice = BigInt(body.result ?? "1000");
  const fee = gasPrice * BigInt(2_000_000);
  return {
    fee: fee.toString(),
    feeFormatted: Number(fee) / 10 ** SUI.nativeCurrency.decimals,
    symbol: SUI.nativeCurrency.symbol,
  };
}

export async function sendSui(_seed: Uint8Array, _request: SendRequest): Promise<SendResult> {
  throw new Error(SUI_SEND_UNAVAILABLE);
}
