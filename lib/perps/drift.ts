// Drift perps integration — client-side only, loaded lazily behind the
// /trade/perpetuals route (the speed rule: the SDK is heavy and must never
// ride in a shared chunk). Reads come straight from Solana RPC via the SDK —
// Drift's hosted data APIs are US-geoblocked, RPC is permissionless.
//
// SDK pinned to the stable dist-tag (2.156.0): the `latest` beta line
// (2.163.0-beta.x) fails account decoding at subscribe() — buffer-layout
// "clo.property" TypeError. Re-test before any bump past stable.
import type { Connection, PublicKey } from "@solana/web3.js";
import type {
    DriftClient,
    User,
    IWallet,
    PerpMarketAccount,
    OraclePriceData,
} from "@drift-labs/sdk";

/** Curated market list — majors + the meme pairs our traders actually know. */
export const PERP_SYMBOLS = [
    "SOL-PERP",
    "BTC-PERP",
    "ETH-PERP",
    "WIF-PERP",
    "1MBONK-PERP",
    "DOGE-PERP",
    "JUP-PERP",
    "XRP-PERP",
] as const;

export type PerpMarketRow = {
    symbol: string;
    marketIndex: number;
    oraclePrice: number;
    bid: number;
    ask: number;
    /** estimated hourly funding, % (positive = longs pay shorts) */
    fundingHourlyPct: number;
};

export type PerpPositionRow = {
    marketIndex: number;
    symbol: string;
    direction: "long" | "short";
    /** position size in base asset */
    baseSize: number;
    /** entry price (quote/base) */
    entryPrice: number;
    oraclePrice: number;
    /** unrealized PnL in USDC */
    pnlUsd: number;
};

export type AccountSummary = {
    exists: boolean;
    freeCollateralUsd: number;
    totalCollateralUsd: number;
    positions: PerpPositionRow[];
};

let readClient: DriftClient | null = null;
let tradeClient: DriftClient | null = null;
let tradeWalletKey: string | null = null;

async function sdk() {
    return import("@drift-labs/sdk");
}

function marketInfos(driftSdk: Awaited<ReturnType<typeof sdk>>) {
    const all = driftSdk.PerpMarkets["mainnet-beta"];
    return PERP_SYMBOLS
        .map((s) => all.find((m) => m.symbol === s))
        .filter((m): m is NonNullable<typeof m> => !!m);
}

// The SDK nests its own @solana/web3.js, so the app's Connection/Keypair are
// a different TYPE identity than the SDK's (same runtime shape/wire protocol).
// This module is the boundary — cast here, nowhere else.
type DriftClientConfigLoose = ConstructorParameters<
    Awaited<ReturnType<typeof sdk>>["DriftClient"]
>[0];

function clientConfig(
    driftSdk: Awaited<ReturnType<typeof sdk>>,
    connection: Connection,
    wallet: IWallet,
): DriftClientConfigLoose {
    const infos = marketInfos(driftSdk);
    return {
        connection,
        wallet,
        env: "mainnet-beta" as const,
        perpMarketIndexes: infos.map((m) => m.marketIndex),
        spotMarketIndexes: [0], // USDC
        oracleInfos: infos.map((m) => ({ publicKey: m.oracle, source: m.oracleSource })),
        accountSubscription: { type: "websocket" as const },
    } as unknown as DriftClientConfigLoose;
}

/** Read-only client (throwaway keypair — nothing ever signs). */
export async function getReadClient(connection: Connection): Promise<DriftClient> {
    if (readClient) return readClient;
    const driftSdk = await sdk();
    const { Keypair: KP } = await import("@solana/web3.js");
    const wallet = new driftSdk.Wallet(KP.generate() as unknown as ConstructorParameters<typeof driftSdk.Wallet>[0]);
    const client = new driftSdk.DriftClient(clientConfig(driftSdk, connection, wallet));
    await client.subscribe();
    readClient = client;
    return client;
}

/** Trading client bound to the connected wallet (wallet-adapter shape). */
export async function getTradeClient(
    connection: Connection,
    wallet: IWallet,
): Promise<DriftClient> {
    const key = wallet.publicKey.toBase58();
    if (tradeClient && tradeWalletKey === key) return tradeClient;
    if (tradeClient) await tradeClient.unsubscribe().catch(() => {});
    const driftSdk = await sdk();
    const client = new driftSdk.DriftClient(clientConfig(driftSdk, connection, wallet));
    await client.subscribe();
    tradeClient = client;
    tradeWalletKey = key;
    return client;
}

function rowFor(
    driftSdk: Awaited<ReturnType<typeof sdk>>,
    client: DriftClient,
    symbol: string,
    marketIndex: number,
): PerpMarketRow | null {
    const market: PerpMarketAccount | undefined = client.getPerpMarketAccount(marketIndex);
    if (!market) return null;
    const oracle: OraclePriceData = client.getOracleDataForPerpMarket(marketIndex);
    const [bid, ask] = driftSdk.calculateBidAskPrice(market.amm, { ...oracle, isMMOracleActive: false });
    const px = (v: InstanceType<typeof driftSdk.BN>) => driftSdk.convertToNumber(v, driftSdk.PRICE_PRECISION);

    // Hourly funding ≈ last 24h avg funding rate / oracle twap, per hour.
    const twap = px(market.amm.historicalOracleData.lastOraclePriceTwap);
    const funding24 = driftSdk.convertToNumber(market.amm.last24HAvgFundingRate, driftSdk.PRICE_PRECISION);
    const fundingHourlyPct = twap > 0 ? (funding24 / twap) * 100 : 0;

    return {
        symbol,
        marketIndex,
        oraclePrice: px(oracle.price),
        bid: px(bid),
        ask: px(ask),
        fundingHourlyPct,
    };
}

/** Market rows for the list view. */
export async function getMarkets(connection: Connection): Promise<PerpMarketRow[]> {
    const driftSdk = await sdk();
    const client = await getReadClient(connection);
    return marketInfos(driftSdk)
        .map((m) => rowFor(driftSdk, client, m.symbol, m.marketIndex))
        .filter((r): r is PerpMarketRow => !!r);
}

/** The connected wallet's Drift account: collateral + open positions. */
export async function getAccountSummary(client: DriftClient): Promise<AccountSummary> {
    const driftSdk = await sdk();
    let exists = false;
    try {
        exists = !!client.getUserAccount();
    } catch {
        exists = false;
    }
    if (!exists) return { exists: false, freeCollateralUsd: 0, totalCollateralUsd: 0, positions: [] };

    const user: User = client.getUser();
    const q = (v: InstanceType<typeof driftSdk.BN>) => driftSdk.convertToNumber(v, driftSdk.QUOTE_PRECISION);
    const infos = marketInfos(driftSdk);

    const positions: PerpPositionRow[] = [];
    for (const m of infos) {
        const p = user.getPerpPosition(m.marketIndex);
        if (!p || p.baseAssetAmount.isZero()) continue;
        const oracle = client.getOracleDataForPerpMarket(m.marketIndex);
        const base = driftSdk.convertToNumber(p.baseAssetAmount, driftSdk.BASE_PRECISION);
        const entry = driftSdk.calculateEntryPrice(p);
        positions.push({
            marketIndex: m.marketIndex,
            symbol: m.symbol,
            direction: base >= 0 ? "long" : "short",
            baseSize: Math.abs(base),
            entryPrice: driftSdk.convertToNumber(entry, driftSdk.PRICE_PRECISION),
            oraclePrice: driftSdk.convertToNumber(oracle.price, driftSdk.PRICE_PRECISION),
            pnlUsd: q(user.getUnrealizedPNL(false, m.marketIndex)),
        });
    }

    return {
        exists: true,
        freeCollateralUsd: q(user.getFreeCollateral()),
        totalCollateralUsd: q(user.getTotalCollateral()),
        positions,
    };
}

/** Deposit USDC (creates the Drift account on first use). Returns tx sig. */
export async function depositUsdc(client: DriftClient, owner: PublicKey, usd: number): Promise<string> {
    const driftSdk = await sdk();
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const usdcMint = new PK("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const ata = spl.getAssociatedTokenAddressSync(usdcMint, owner, true);
    const amount = new driftSdk.BN(Math.round(usd * 1_000_000));

    let hasAccount = false;
    try {
        hasAccount = !!client.getUserAccount();
    } catch {
        hasAccount = false;
    }
    if (!hasAccount) {
        const [sig] = await client.initializeUserAccountAndDepositCollateral(amount, ata, 0);
        return sig;
    }
    return client.deposit(amount, 0, ata);
}

/** Withdraw free USDC collateral back to the wallet. */
export async function withdrawUsdc(client: DriftClient, owner: PublicKey, usd: number): Promise<string> {
    const driftSdk = await sdk();
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const usdcMint = new PK("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const ata = spl.getAssociatedTokenAddressSync(usdcMint, owner, true);
    return client.withdraw(new driftSdk.BN(Math.round(usd * 1_000_000)), 0, ata);
}

/** Open a market-order position sized in USD notional. Returns tx sig. */
export async function openPosition(
    client: DriftClient,
    marketIndex: number,
    direction: "long" | "short",
    usdNotional: number,
): Promise<string> {
    const driftSdk = await sdk();
    const oracle = client.getOracleDataForPerpMarket(marketIndex);
    const price = driftSdk.convertToNumber(oracle.price, driftSdk.PRICE_PRECISION);
    if (price <= 0) throw new Error("No oracle price");
    const baseAmount = driftSdk.numberToSafeBN(usdNotional / price, driftSdk.BASE_PRECISION);

    return client.placePerpOrder(
        driftSdk.getMarketOrderParams({
            marketIndex,
            direction: direction === "long" ? driftSdk.PositionDirection.LONG : driftSdk.PositionDirection.SHORT,
            baseAssetAmount: baseAmount,
        }),
    );
}

/** Close the whole position in a market with a reduce-only market order. */
export async function closePosition(client: DriftClient, marketIndex: number): Promise<string> {
    return client.closePosition(marketIndex);
}

/** Tear down subscriptions (route unmount). */
export async function teardown(): Promise<void> {
    await readClient?.unsubscribe().catch(() => {});
    await tradeClient?.unsubscribe().catch(() => {});
    readClient = null;
    tradeClient = null;
    tradeWalletKey = null;
}
