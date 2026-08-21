// EVM balances via viem against each chain's RPC.
//
// Token DISCOVERY (enumerating arbitrary holdings) needs an indexer — an RPC
// alone cannot answer "which tokens does this address hold". With
// ALCHEMY_API_KEY set we get real discovery; without it we fall back to
// probing a curated list and mark the result `partial`, so the UI can say
// "these are the tokens we can see" instead of implying the wallet is empty.

import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";
import type { ChainConfig, ChainId } from "../types";
import { getNativePrice, getTokenPrices } from "./prices";
import type { AssetFetchResult, AssetProvider, ChainAsset } from "./types";
import { fetchWithDeadline } from "./timeout";

/**
 * Well-known tokens probed when no indexer key is configured.
 * Deliberately short and only addresses that are verified — a wrong entry
 * would surface a mislabeled balance. HyperEVM and Robinhood Chain are left
 * empty rather than guessed.
 */
const CURATED_TOKENS: Partial<Record<ChainId, Address[]>> = {
  ethereum: [
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
    "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", // WBTC
  ],
  base: [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
    "0x4200000000000000000000000000000000000006", // WETH
    "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI
  ],
  polygon: [
    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC (native)
    "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
    "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
    "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
    "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
  ],
  bnb: [
    "0x55d398326f99059fF775485246999027B3197955", // USDT (BSC-USD)
    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC
    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
    "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
  ],
  hyperevm: [],
  robinhood: [],
};

/**
 * Portfolio API network slugs. NOT the same strings as the RPC subdomains —
 * Polygon is `matic-mainnet` here but `polygon-mainnet` for JSON-RPC.
 */
const PORTFOLIO_NETWORKS: Partial<Record<ChainId, string>> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  polygon: "matic-mainnet",
  bnb: "bnb-mainnet",
};

interface PortfolioToken {
  network: string;
  tokenAddress: string | null;
  tokenBalance: string;
  tokenMetadata?: { symbol?: string | null; decimals?: number | null; name?: string | null; logo?: string | null };
  tokenPrices?: { currency: string; value: string }[];
}

/**
 * Balances, metadata and prices for MANY EVM chains in one request.
 *
 * The per-chain path costs a getBalance, a token-balance call, then three
 * metadata reads per token — roughly 390 RPC round trips across Ethereum and
 * Polygon alone. Since the wallet now aggregates every chain into one list,
 * that ran on every drawer open. This collapses it to a single call.
 *
 * Returns null when unavailable (no key), so the caller falls back per chain.
 */
export async function getEvmAssetsBatch(
  address: string,
  chains: ChainConfig[]
): Promise<Map<ChainId, AssetFetchResult> | null> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;

  const covered = chains.filter((c) => PORTFOLIO_NETWORKS[c.id]);
  if (covered.length === 0) return null;

  const byNetwork = new Map<string, ChainConfig>();
  for (const c of covered) byNetwork.set(PORTFOLIO_NETWORKS[c.id]!, c);

  const collected: PortfolioToken[] = [];
  let pageKey: string | undefined;

  try {
    // Bounded: 100 entries per page, and a wallet past ~500 holdings is
    // overwhelmingly dust. Better a capped list than an unbounded loop.
    for (let page = 0; page < 5; page++) {
      const res: Response = await fetchWithDeadline(
        `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/by-address`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            addresses: [{ address, networks: [...byNetwork.keys()] }],
            withMetadata: true,
            withPrices: true,
            ...(pageKey ? { pageKey } : {}),
          }),
        }
      );
      if (!res.ok) return null;

      const body = (await res.json()) as { data?: { tokens?: PortfolioToken[]; pageKey?: string } };
      collected.push(...(body.data?.tokens ?? []));
      pageKey = body.data?.pageKey;
      if (!pageKey) break;
    }
  } catch {
    return null;
  }

  const out = new Map<ChainId, AssetFetchResult>();
  for (const chain of covered) out.set(chain.id, { assets: [], totalUsd: 0 });

  for (const token of collected) {
    const chain = byNetwork.get(token.network);
    if (!chain) continue;

    const raw = BigInt(token.tokenBalance || "0");
    const isNative = !token.tokenAddress;
    // A chain's own coin always belongs in the list, at zero like anything
    // else — that's how the wallet shows you which networks you have. Only
    // zero-balance TOKENS are noise worth dropping.
    if (raw <= BigInt(0) && !isNative) continue;
    const decimals = isNative
      ? chain.nativeCurrency.decimals
      : (token.tokenMetadata?.decimals ?? 18);
    const balance = Number(formatUnits(raw, decimals));
    const price = Number(token.tokenPrices?.find((p) => p.currency === "usd")?.value);
    const hasPrice = Number.isFinite(price) && price > 0;

    const bucket = out.get(chain.id)!;
    bucket.assets.push({
      chain: chain.id,
      contract: token.tokenAddress,
      symbol: (isNative ? chain.nativeCurrency.symbol : token.tokenMetadata?.symbol) || "UNKNOWN",
      name: (isNative ? chain.name : token.tokenMetadata?.name) || "Unknown Coin",
      icon: token.tokenMetadata?.logo ?? undefined,
      decimals,
      balance,
      rawBalance: raw.toString(),
      price: hasPrice ? price : undefined,
      usdValue: hasPrice ? balance * price : undefined,
      isNative,
    });
  }

  // The Portfolio API omits a chain's native entry entirely when the balance is
  // zero, so a chain the user holds nothing on would vanish from the wallet.
  // Synthesize the missing ones at zero.
  const missingNative = [...out.entries()].filter(
    ([, result]) => !result.assets.some((a) => a.isNative)
  );
  const nativePrices = await Promise.all(
    missingNative.map(([chainId]) => getNativePrice(chainId).catch(() => null))
  );

  missingNative.forEach(([chainId, result], i) => {
    const chain = covered.find((c) => c.id === chainId)!;
    const quote = nativePrices[i];
    result.assets.push({
      chain: chainId,
      contract: null,
      symbol: chain.nativeCurrency.symbol,
      name: chain.name,
      decimals: chain.nativeCurrency.decimals,
      balance: 0,
      rawBalance: "0",
      price: quote?.price,
      priceChange24h: quote?.priceChange24h,
      usdValue: 0,
      isNative: true,
    });
  });

  for (const result of out.values()) {
    result.assets.sort((a, b) => {
      if (a.isNative !== b.isNative) return a.isNative ? -1 : 1;
      return (b.usdValue ?? 0) - (a.usdValue ?? 0);
    });
    result.totalUsd = result.assets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0);
  }

  return out;
}

/** Alchemy network slugs, for the discovery path. */
const ALCHEMY_NETWORKS: Partial<Record<ChainId, string>> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  polygon: "polygon-mainnet",
  bnb: "bnb-mainnet",
};

function clientFor(chain: ChainConfig) {
  return createPublicClient({ transport: http(chain.rpcUrl) });
}

interface RawToken {
  contract: Address;
  raw: bigint;
}

interface DiscoveryOutcome {
  tokens: RawToken[] | null;
  /** Why discovery was unavailable — surfaced so the UI states the real reason. */
  reason?: string;
}

/** Full discovery through Alchemy. `tokens: null` means fall back to curated. */
async function discoverViaAlchemy(
  address: string,
  chain: ChainConfig
): Promise<DiscoveryOutcome> {
  const apiKey = process.env.ALCHEMY_API_KEY;
  const network = ALCHEMY_NETWORKS[chain.id];

  if (!apiKey) return { tokens: null, reason: "set ALCHEMY_API_KEY to see all coins" };
  if (!network) {
    return { tokens: null, reason: `Alchemy does not support ${chain.name}` };
  }

  try {
    const res = await fetchWithDeadline(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenBalances",
        params: [address, "erc20"],
      }),
    });
    // Parse the body even on a non-2xx: a network that isn't enabled for the
    // app answers 403 with a JSON-RPC error naming the exact fix. Reporting
    // that verbatim is the difference between "your wallet is empty" and
    // "enable Base on your Alchemy app".
    const body = (await res.json().catch(() => null)) as {
      result?: { tokenBalances?: { contractAddress: string; tokenBalance: string }[] };
      error?: { message?: string };
    } | null;

    if (body?.error?.message) {
      return { tokens: null, reason: body.error.message.split(" Visit this page")[0] };
    }
    if (!res.ok || !body) return { tokens: null, reason: `Alchemy returned ${res.status}` };

    const balances = body.result?.tokenBalances ?? [];
    return {
      tokens: balances
        .map((b) => ({ contract: b.contractAddress as Address, raw: BigInt(b.tokenBalance || "0") }))
        .filter((t) => t.raw > BigInt(0)),
    };
  } catch (err: any) {
    return { tokens: null, reason: `Alchemy unreachable: ${err?.message ?? err}` };
  }
}

/** Fallback: probe the curated list directly over RPC. */
async function probeCurated(address: string, chain: ChainConfig): Promise<RawToken[]> {
  const client = clientFor(chain);
  const candidates = CURATED_TOKENS[chain.id] ?? [];

  const results = await Promise.all(
    candidates.map(async (contract) => {
      try {
        const raw = await client.readContract({
          address: contract,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address as Address],
        });
        return { contract, raw };
      } catch {
        return { contract, raw: BigInt(0) };
      }
    })
  );

  return results.filter((t) => t.raw > BigInt(0));
}

export const evmAssetProvider: AssetProvider = {
  kind: "evm",

  async getAssets(address: string, chain: ChainConfig): Promise<AssetFetchResult> {
    const client = clientFor(chain);

    const [nativeRaw, nativeQuote, discovered] = await Promise.all([
      // Deliberately NOT caught: a failed balance read must surface as an error,
      // never as a zero balance. Rendering an unreachable RPC as an empty
      // wallet is how you convince someone their funds are gone.
      client.getBalance({ address: address as Address }).catch((err) => {
        throw new Error(`${chain.name} RPC balance read failed: ${err?.message ?? err}`);
      }),
      getNativePrice(chain.id),
      discoverViaAlchemy(address, chain),
    ]);

    const tokens = discovered.tokens ?? (await probeCurated(address, chain));
    const partial = discovered.tokens
      ? undefined
      : { reason: `${discovered.reason} — showing well-known coins only` };

    // Symbol/name/decimals per discovered token.
    const metadata = await Promise.all(
      tokens.map(async (t) => {
        try {
          const [symbol, name, decimals] = await Promise.all([
            client.readContract({ address: t.contract, abi: erc20Abi, functionName: "symbol" }),
            client.readContract({ address: t.contract, abi: erc20Abi, functionName: "name" }),
            client.readContract({ address: t.contract, abi: erc20Abi, functionName: "decimals" }),
          ]);
          return { symbol, name, decimals };
        } catch {
          return null;
        }
      })
    );

    const tokenQuotes = await getTokenPrices(
      chain.id,
      tokens.map((t) => t.contract)
    );

    const nativeBalance = Number(formatUnits(nativeRaw, chain.nativeCurrency.decimals));
    const assets: ChainAsset[] = [
      {
        chain: chain.id,
        contract: null,
        symbol: chain.nativeCurrency.symbol,
        name: chain.name,
        decimals: chain.nativeCurrency.decimals,
        balance: nativeBalance,
        rawBalance: nativeRaw.toString(),
        price: nativeQuote?.price,
        priceChange24h: nativeQuote?.priceChange24h,
        usdValue: nativeQuote ? nativeBalance * nativeQuote.price : undefined,
        isNative: true,
      },
    ];

    tokens.forEach((t, i) => {
      const meta = metadata[i];
      if (!meta) return;
      const balance = Number(formatUnits(t.raw, meta.decimals));
      const quote = tokenQuotes[t.contract.toLowerCase()];
      assets.push({
        chain: chain.id,
        contract: t.contract,
        symbol: meta.symbol,
        name: meta.name,
        decimals: meta.decimals,
        balance,
        rawBalance: t.raw.toString(),
        price: quote?.price,
        priceChange24h: quote?.priceChange24h,
        usdValue: quote ? balance * quote.price : undefined,
        isNative: false,
      });
    });

    assets.sort((a, b) => {
      if (a.isNative !== b.isNative) return a.isNative ? -1 : 1;
      return (b.usdValue ?? 0) - (a.usdValue ?? 0);
    });

    return {
      assets,
      totalUsd: assets.reduce((sum, a) => sum + (a.usdValue ?? 0), 0),
      partial,
    };
  },
};
