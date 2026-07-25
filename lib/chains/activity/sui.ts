// Sui history via the public fullnode JSON-RPC — free and keyless, with
// balance changes included so amounts don't need reconstructing from effects.

import { SUI } from "../registry";
import type { ChainConfig } from "../types";
import { SUI_NATIVE_COIN_TYPE } from "../assets/sui";
import type { ActivityProvider, ChainActivity } from "./types";

interface SuiTxBlock {
  digest: string;
  timestampMs?: string;
  effects?: { status?: { status?: string }; gasUsed?: Record<string, string> };
  balanceChanges?: { coinType: string; owner: unknown; amount: string }[];
}

async function query(rpcUrl: string, filter: object, limit: number): Promise<SuiTxBlock[]> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryTransactionBlocks",
      params: [
        { filter, options: { showEffects: true, showBalanceChanges: true } },
        null,
        limit,
        true, // descending
      ],
    }),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { result?: { data?: SuiTxBlock[] } };
  return body.result?.data ?? [];
}

export const suiActivityProvider: ActivityProvider = {
  kind: "sui",

  async getActivity(address, chain: ChainConfig, limit): Promise<ChainActivity[]> {
    const rpcUrl = chain.rpcUrl ?? SUI.rpcUrl!;

    // Sui filters one relation at a time, like Alchemy — merge both.
    const [sent, received] = await Promise.all([
      query(rpcUrl, { FromAddress: address }, limit),
      query(rpcUrl, { ToAddress: address }, limit),
    ]);

    const seen = new Set<string>();
    const out: ChainActivity[] = [];

    for (const tx of [...sent, ...received]) {
      if (seen.has(tx.digest)) continue;
      seen.add(tx.digest);

      // Pick the balance change that concerns this address; gas shows up as a
      // negative SUI change, so prefer a non-gas movement when one exists.
      const changes = tx.balanceChanges ?? [];
      const primary =
        changes.find((c) => c.coinType !== SUI_NATIVE_COIN_TYPE) ?? changes[0];

      const raw = primary ? BigInt(primary.amount) : BigInt(0);
      const isNative = !primary || primary.coinType === SUI_NATIVE_COIN_TYPE;
      const decimals = isNative ? chain.nativeCurrency.decimals : 9;

      const gasUsed = tx.effects?.gasUsed;
      const fee = gasUsed
        ? (Number(gasUsed.computationCost ?? 0) +
            Number(gasUsed.storageCost ?? 0) -
            Number(gasUsed.storageRebate ?? 0)) /
          10 ** chain.nativeCurrency.decimals
        : undefined;

      out.push({
        chain: chain.id,
        txId: tx.digest,
        timestamp: tx.timestampMs ? Math.floor(Number(tx.timestampMs) / 1000) : 0,
        status: tx.effects?.status?.status === "success" ? "success" : "failed",
        isOutgoing: raw < BigInt(0),
        amount: Math.abs(Number(raw)) / 10 ** decimals,
        symbol: isNative ? chain.nativeCurrency.symbol : (primary?.coinType.split("::").pop() ?? "?"),
        contract: isNative ? null : (primary?.coinType ?? null),
        fee,
        type: "transfer",
        explorerUrl: `${chain.explorer}/tx/${tx.digest}`,
      });
    }

    out.sort((a, b) => b.timestamp - a.timestamp);
    return out.slice(0, limit);
  },
};
