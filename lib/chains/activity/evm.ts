// EVM history via Alchemy's Transfers API.
//
// An RPC cannot answer "what happened to this address" — that needs an index.
// Without ALCHEMY_API_KEY (or on a chain Alchemy doesn't serve) this returns
// empty rather than pretending there is no history.

import type { ChainConfig, ChainId } from "../types";
import type { ActivityProvider, ChainActivity } from "./types";

const ALCHEMY_NETWORKS: Partial<Record<ChainId, string>> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  polygon: "polygon-mainnet",
};

interface Transfer {
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  rawContract?: { address?: string | null };
  metadata?: { blockTimestamp?: string };
}

async function fetchTransfers(
  apiKey: string,
  network: string,
  address: string,
  direction: "from" | "to",
  limit: number
): Promise<Transfer[]> {
  const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_getAssetTransfers",
      params: [
        {
          fromBlock: "0x0",
          [direction === "from" ? "fromAddress" : "toAddress"]: address,
          category: ["external", "erc20", "erc721", "erc1155"],
          withMetadata: true,
          excludeZeroValue: true,
          order: "desc",
          maxCount: `0x${limit.toString(16)}`,
        },
      ],
    }),
  });
  if (!res.ok) return [];

  const body = (await res.json()) as { result?: { transfers?: Transfer[] }; error?: unknown };
  return body.result?.transfers ?? [];
}

export const evmActivityProvider: ActivityProvider = {
  kind: "evm",

  async getActivity(address, chain: ChainConfig, limit): Promise<ChainActivity[]> {
    const apiKey = process.env.ALCHEMY_API_KEY;
    const network = ALCHEMY_NETWORKS[chain.id];
    if (!apiKey || !network) return [];

    // The API filters by one direction at a time, so ask for both and merge.
    const [sent, received] = await Promise.all([
      fetchTransfers(apiKey, network, address, "from", limit),
      fetchTransfers(apiKey, network, address, "to", limit),
    ]);

    const lower = address.toLowerCase();
    const seen = new Set<string>();
    const out: ChainActivity[] = [];

    for (const t of [...sent, ...received]) {
      // A self-transfer appears in both lists.
      const key = `${t.hash}:${t.rawContract?.address ?? "native"}:${t.value}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isOutgoing = t.from?.toLowerCase() === lower;
      out.push({
        chain: chain.id,
        txId: t.hash,
        timestamp: t.metadata?.blockTimestamp
          ? Math.floor(new Date(t.metadata.blockTimestamp).getTime() / 1000)
          : 0,
        // The Transfers API only surfaces mined transfers, so anything
        // returned here succeeded — a reverted tx moves nothing.
        status: "success",
        isOutgoing,
        amount: t.value ?? 0,
        symbol: t.asset ?? chain.nativeCurrency.symbol,
        contract: t.rawContract?.address ?? null,
        counterparty: isOutgoing ? (t.to ?? undefined) : t.from,
        type: t.category === "external" ? "transfer" : t.category,
        explorerUrl: `${chain.explorer}/tx/${t.hash}`,
      });
    }

    out.sort((a, b) => b.timestamp - a.timestamp);
    return out.slice(0, limit);
  },
};
