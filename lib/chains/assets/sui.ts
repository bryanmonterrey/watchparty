// Sui balances via the public fullnode JSON-RPC — free, keyless, and it
// enumerates every coin type the address holds, so token discovery is complete
// without an indexer.

import { SUI } from "../registry";
import type { ChainConfig } from "../types";
import { getNativePrice, getTokenPrices } from "./prices";
import type { AssetFetchResult, AssetProvider, ChainAsset } from "./types";
import { fetchWithDeadline } from "./timeout";

export const SUI_NATIVE_COIN_TYPE = "0x2::sui::SUI";

interface SuiBalance {
  coinType: string;
  totalBalance: string;
}

interface SuiCoinMetadata {
  decimals: number;
  name: string;
  symbol: string;
  iconUrl?: string | null;
}

async function suiRpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetchWithDeadline(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`sui rpc ${method} returned ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`sui rpc ${method}: ${body.error.message}`);
  return body.result as T;
}

export async function getSuiBalances(
  address: string,
  rpcUrl = SUI.rpcUrl!
): Promise<SuiBalance[]> {
  return suiRpc<SuiBalance[]>(rpcUrl, "suix_getAllBalances", [address]);
}

export const suiAssetProvider: AssetProvider = {
  kind: "sui",

  async getAssets(address: string, chain: ChainConfig): Promise<AssetFetchResult> {
    const rpcUrl = chain.rpcUrl!;
    const balances = (await getSuiBalances(address, rpcUrl)).filter(
      (b) => BigInt(b.totalBalance) > BigInt(0)
    );

    // Metadata per coin type, best-effort — an unknown coin still shows its balance.
    const metadata = await Promise.all(
      balances.map(async (b) => {
        if (b.coinType === SUI_NATIVE_COIN_TYPE) {
          return {
            decimals: chain.nativeCurrency.decimals,
            name: "Sui",
            symbol: chain.nativeCurrency.symbol,
          } satisfies SuiCoinMetadata;
        }
        try {
          return await suiRpc<SuiCoinMetadata>(rpcUrl, "suix_getCoinMetadata", [b.coinType]);
        } catch {
          return null;
        }
      })
    );

    const nonNative = balances
      .filter((b) => b.coinType !== SUI_NATIVE_COIN_TYPE)
      .map((b) => b.coinType);
    const [nativeQuote, tokenQuotes] = await Promise.all([
      getNativePrice("sui"),
      getTokenPrices("sui", nonNative),
    ]);

    const assets: ChainAsset[] = balances.map((b, i) => {
      const meta = metadata[i];
      const isNative = b.coinType === SUI_NATIVE_COIN_TYPE;
      const decimals = meta?.decimals ?? chain.nativeCurrency.decimals;
      const balance = Number(BigInt(b.totalBalance)) / 10 ** decimals;
      const quote = isNative ? nativeQuote : tokenQuotes[b.coinType.toLowerCase()];

      return {
        chain: "sui",
        contract: isNative ? null : b.coinType,
        symbol: meta?.symbol ?? "UNKNOWN",
        name: meta?.name ?? b.coinType.split("::").pop() ?? "Unknown",
        icon: meta?.iconUrl ?? undefined,
        decimals,
        balance,
        rawBalance: b.totalBalance,
        price: quote?.price,
        priceChange24h: quote?.priceChange24h,
        usdValue: quote ? balance * quote.price : undefined,
        isNative,
      };
    });

    assets.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    const totalUsd = assets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0);
    return { assets, totalUsd };
  },
};
