// Drift perps integration — client-side only, loaded lazily behind the
// /trade/perpetuals route (the speed rule: the SDK is heavy and must never
// ride in a shared chunk). Reads come straight from Solana RPC via the SDK —
// Drift's hosted data APIs are US-geoblocked, RPC is permissionless.
//
// SIGNING MODEL: the SDK never signs or sends. Every action returns an
// UNSIGNED transaction built from the SDK's instruction getters, and the view
// submits it through the app's dual path — extension wallets sendTransaction,
// Swig wallets go through useWalletSigning's signAndSubmit (which wraps the
// instructions in Swig execute; the exact flow boost purchases already use).
// The DriftClient itself holds a pubkey-only stub wallet: it exists to derive
// the user's accounts and read state, not to sign.
//
// SDK pinned to the stable dist-tag (2.156.0): the `latest` beta line
// (2.163.0-beta.x) fails account decoding at subscribe() — buffer-layout
// "clo.property" TypeError. Re-test before any bump past stable.
import type { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { DriftClient, User, OraclePriceData } from "@drift-labs/sdk";

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

const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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
let tradeAuthority: string | null = null;

async function sdk() {
    return import("@drift-labs/sdk");
}

type DriftSdk = Awaited<ReturnType<typeof sdk>>;

function marketInfos(driftSdk: DriftSdk) {
    const all = driftSdk.PerpMarkets["mainnet-beta"];
    return PERP_SYMBOLS
        .map((s) => all.find((m) => m.symbol === s))
        .filter((m): m is NonNullable<typeof m> => !!m);
}

// The SDK nests its own @solana/web3.js, so the app's Connection/PublicKey are
// a different TYPE identity than the SDK's (same runtime shape/wire protocol).
// This module is the boundary — cast here, nowhere else.
type DriftClientConfigLoose = ConstructorParameters<DriftSdk["DriftClient"]>[0];

/** Pubkey-only wallet: derives accounts, refuses to sign (we never ask it to). */
function stubWallet(publicKey: PublicKey) {
    return {
        publicKey,
        signTransaction: () => Promise.reject(new Error("read-only wallet")),
        signAllTransactions: () => Promise.reject(new Error("read-only wallet")),
    };
}

async function makeClient(connection: Connection, authority: PublicKey): Promise<DriftClient> {
    const driftSdk = await sdk();
    const infos = marketInfos(driftSdk);
    const client = new driftSdk.DriftClient({
        connection,
        wallet: stubWallet(authority),
        env: "mainnet-beta",
        perpMarketIndexes: infos.map((m) => m.marketIndex),
        spotMarketIndexes: [0], // USDC
        oracleInfos: infos.map((m) => ({ publicKey: m.oracle, source: m.oracleSource })),
        accountSubscription: { type: "websocket" },
    } as unknown as DriftClientConfigLoose);
    await client.subscribe();
    return client;
}

/** Read-only client (throwaway pubkey — market data only). */
export async function getReadClient(connection: Connection): Promise<DriftClient> {
    if (readClient) return readClient;
    const { Keypair } = await import("@solana/web3.js");
    readClient = await makeClient(connection, Keypair.generate().publicKey);
    return readClient;
}

/** Client bound to the user's wallet address (extension or Swig — just a pubkey). */
export async function getTradeClient(connection: Connection, authority: PublicKey): Promise<DriftClient> {
    const key = authority.toBase58();
    if (tradeClient && tradeAuthority === key) return tradeClient;
    if (tradeClient) await tradeClient.unsubscribe().catch(() => {});
    tradeClient = await makeClient(connection, authority);
    tradeAuthority = key;
    return tradeClient;
}

function rowFor(driftSdk: DriftSdk, client: DriftClient, symbol: string, marketIndex: number): PerpMarketRow | null {
    const market = client.getPerpMarketAccount(marketIndex);
    if (!market) return null;
    const oracle: OraclePriceData = client.getOracleDataForPerpMarket(marketIndex);
    const [bid, ask] = driftSdk.calculateBidAskPrice(market.amm, { ...oracle, isMMOracleActive: false });
    const px = (v: InstanceType<typeof driftSdk.BN>) => driftSdk.convertToNumber(v, driftSdk.PRICE_PRECISION);

    // Hourly funding ≈ last 24h avg funding rate / oracle twap, per hour.
    const twap = px(market.amm.historicalOracleData.lastOraclePriceTwap);
    const funding24 = driftSdk.convertToNumber(market.amm.last24HAvgFundingRate, driftSdk.PRICE_PRECISION);
    const fundingHourlyPct = twap > 0 ? (funding24 / twap) * 100 : 0;

    return { symbol, marketIndex, oraclePrice: px(oracle.price), bid: px(bid), ask: px(ask), fundingHourlyPct };
}

/** Market rows for the list view. */
export async function getMarkets(connection: Connection): Promise<PerpMarketRow[]> {
    const driftSdk = await sdk();
    const client = await getReadClient(connection);
    return marketInfos(driftSdk)
        .map((m) => rowFor(driftSdk, client, m.symbol, m.marketIndex))
        .filter((r): r is PerpMarketRow => !!r);
}

function userExists(client: DriftClient): boolean {
    try {
        return !!client.getUserAccount();
    } catch {
        return false;
    }
}

/** The wallet's Drift account: collateral + open positions. */
export async function getAccountSummary(client: DriftClient): Promise<AccountSummary> {
    const driftSdk = await sdk();
    if (!userExists(client)) return { exists: false, freeCollateralUsd: 0, totalCollateralUsd: 0, positions: [] };

    const user: User = client.getUser();
    const q = (v: InstanceType<typeof driftSdk.BN>) => driftSdk.convertToNumber(v, driftSdk.QUOTE_PRECISION);

    const positions: PerpPositionRow[] = [];
    for (const m of marketInfos(driftSdk)) {
        const p = user.getPerpPosition(m.marketIndex);
        if (!p || p.baseAssetAmount.isZero()) continue;
        const oracle = client.getOracleDataForPerpMarket(m.marketIndex);
        const base = driftSdk.convertToNumber(p.baseAssetAmount, driftSdk.BASE_PRECISION);
        positions.push({
            marketIndex: m.marketIndex,
            symbol: m.symbol,
            direction: base >= 0 ? "long" : "short",
            baseSize: Math.abs(base),
            entryPrice: driftSdk.convertToNumber(driftSdk.calculateEntryPrice(p), driftSdk.PRICE_PRECISION),
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

// ─── Unsigned-transaction builders ──────────────────────────

async function buildTx(
    connection: Connection,
    feePayer: PublicKey,
    ixs: TransactionInstruction[],
): Promise<Transaction> {
    const { Transaction: Tx } = await import("@solana/web3.js");
    const tx = new Tx();
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    for (const ix of ixs) tx.add(ix);
    return tx;
}

/**
 * watchparty's Drift referral (35% of referred taker fees). Only attached
 * when the referrer accounts actually exist on-chain — otherwise account
 * creation would fail for the user.
 */
async function referrerInfo(driftSdk: DriftSdk, client: DriftClient, connection: Connection) {
    const treasury = process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
    if (!treasury) return undefined;
    try {
        const { PublicKey: PK } = await import("@solana/web3.js");
        const authority = new PK(treasury);
        const programId = client.program.programId;
        const referrer = await driftSdk.getUserAccountPublicKey(
            programId,
            authority as unknown as Parameters<typeof driftSdk.getUserAccountPublicKey>[1],
            0,
        );
        const referrerStats = driftSdk.getUserStatsAccountPublicKey(
            programId,
            authority as unknown as Parameters<typeof driftSdk.getUserStatsAccountPublicKey>[1],
        );
        const statsInfo = await connection.getAccountInfo(new PK(referrerStats.toBase58()));
        if (!statsInfo) return undefined;
        return { referrer, referrerStats };
    } catch {
        return undefined;
    }
}

/** Deposit USDC (first deposit also creates the Drift account). Unsigned tx. */
export async function prepareDeposit(
    client: DriftClient,
    connection: Connection,
    owner: PublicKey,
    usd: number,
): Promise<Transaction> {
    const driftSdk = await sdk();
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const ata = spl.getAssociatedTokenAddressSync(new PK(USDC_MINT_ADDRESS), owner, true);
    const amount = new driftSdk.BN(Math.round(usd * 1_000_000));

    const ixs: TransactionInstruction[] = [];
    const exists = userExists(client);
    if (!exists) {
        const ref = await referrerInfo(driftSdk, client, connection);
        const [initIxs] = await client.getInitializeUserAccountIxs(
            0,
            undefined,
            ref as Parameters<typeof client.getInitializeUserAccountIxs>[2],
        );
        ixs.push(...(initIxs as unknown as TransactionInstruction[]));
    }
    const depositIx = await client.getDepositInstruction(
        amount,
        0,
        ata as unknown as Parameters<typeof client.getDepositInstruction>[2],
        0,
        false,
        exists,
    );
    ixs.push(depositIx as unknown as TransactionInstruction);
    return buildTx(connection, owner, ixs);
}

/** Withdraw free USDC collateral back to the wallet. Unsigned tx. */
export async function prepareWithdraw(
    client: DriftClient,
    connection: Connection,
    owner: PublicKey,
    usd: number,
): Promise<Transaction> {
    const driftSdk = await sdk();
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const mint = new PK(USDC_MINT_ADDRESS);
    const ata = spl.getAssociatedTokenAddressSync(mint, owner, true);

    // The user's USDC ATA may have been closed — recreate idempotently.
    const ataIx = spl.createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint);
    const withdrawIxs = await client.getWithdrawalIxs(
        new driftSdk.BN(Math.round(usd * 1_000_000)),
        0,
        ata as unknown as Parameters<typeof client.getWithdrawalIxs>[2],
        true, // reduceOnly: never open a borrow from the withdraw box
    );
    return buildTx(connection, owner, [ataIx, ...(withdrawIxs as unknown as TransactionInstruction[])]);
}

/** Open a market-order position sized in USD notional. Unsigned tx. */
export async function prepareOpenPosition(
    client: DriftClient,
    connection: Connection,
    owner: PublicKey,
    marketIndex: number,
    direction: "long" | "short",
    usdNotional: number,
): Promise<Transaction> {
    const driftSdk = await sdk();
    const oracle = client.getOracleDataForPerpMarket(marketIndex);
    const price = driftSdk.convertToNumber(oracle.price, driftSdk.PRICE_PRECISION);
    if (price <= 0) throw new Error("No oracle price");
    const baseAmount = driftSdk.numberToSafeBN(usdNotional / price, driftSdk.BASE_PRECISION);

    const ix = await client.getPlacePerpOrderIx(
        driftSdk.getMarketOrderParams({
            marketIndex,
            direction: direction === "long" ? driftSdk.PositionDirection.LONG : driftSdk.PositionDirection.SHORT,
            baseAssetAmount: baseAmount,
        }),
    );
    return buildTx(connection, owner, [ix as unknown as TransactionInstruction]);
}

/** Close the whole position with a reduce-only market order. Unsigned tx. */
export async function prepareClosePosition(
    client: DriftClient,
    connection: Connection,
    owner: PublicKey,
    marketIndex: number,
): Promise<Transaction> {
    const driftSdk = await sdk();
    const user: User = client.getUser();
    const p = user.getPerpPosition(marketIndex);
    if (!p || p.baseAssetAmount.isZero()) throw new Error("No open position");

    const long = !p.baseAssetAmount.isNeg();
    const ix = await client.getPlacePerpOrderIx(
        driftSdk.getMarketOrderParams({
            marketIndex,
            direction: long ? driftSdk.PositionDirection.SHORT : driftSdk.PositionDirection.LONG,
            baseAssetAmount: p.baseAssetAmount.abs(),
            reduceOnly: true,
        }),
    );
    return buildTx(connection, owner, [ix as unknown as TransactionInstruction]);
}

/** Tear down subscriptions (route unmount). */
export async function teardown(): Promise<void> {
    await readClient?.unsubscribe().catch(() => {});
    await tradeClient?.unsubscribe().catch(() => {});
    readClient = null;
    tradeClient = null;
    tradeAuthority = null;
}
