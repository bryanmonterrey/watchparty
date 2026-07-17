// Flash Trade perps integration — client-side only, loaded lazily behind the
// /trade/perpetuals route (the speed rule: the SDK is heavy and must never
// ride in a shared chunk). Everything reads straight from Solana RPC + the
// program's own on-chain view instructions (simulated, free) — no Flash
// backend dependency, no geoblock surface.
//
// VENUE MODEL (differs from the old Drift module): Flash is GMX-style —
// there is no deposit/withdraw account step. Collateral is escrowed
// per-position from the wallet at open and returned at close, so the UX is
// "wallet USDC in → position → wallet USDC out". Longs collateralize in the
// target token (the pool swaps USDC in the same tx via swapAndOpen); shorts
// collateralize in USDC directly.
//
// SIGNING MODEL (unchanged): the SDK never signs or sends. Every action
// returns an UNSIGNED legacy transaction built from the SDK's instruction
// getters, and the view submits it through the app's dual path — extension
// wallets sendTransaction, Swig wallets via useWalletSigning's signAndSubmit.
// The PerpetualsClient holds a pubkey-only stub wallet: builders read
// provider.wallet.publicKey as the owner, so the trade client is constructed
// around the user's address but can never sign.
import type { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { PerpetualsClient, PoolConfig, MarketConfig, CustodyConfig } from "flash-sdk";
import type BN from "bn.js";

/**
 * Curated market list — majors + the memes our traders actually know.
 * Each entry names the Flash pool that lists the pair; both the long and
 * short market of that pair live in the same pool.
 */
export const PERP_MARKETS = [
    { symbol: "SOL", pool: "Crypto.1" },
    { symbol: "BTC", pool: "Crypto.1" },
    { symbol: "ETH", pool: "Crypto.1" },
    { symbol: "JUP", pool: "Governance.1" },
    { symbol: "BONK", pool: "Community.1" },
    { symbol: "PENGU", pool: "Community.1" },
    { symbol: "PUMP", pool: "Community.1" },
    { symbol: "WIF", pool: "Community.2" },
    { symbol: "FARTCOIN", pool: "Trump.1" },
] as const;

export type PerpSymbol = (typeof PERP_MARKETS)[number]["symbol"];

const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USD_DECIMALS = 6;
/** Max acceptable fill drift from the quoted price, in bps. */
const SLIPPAGE_BPS = 50;

export type PerpMarketRow = {
    symbol: PerpSymbol;
    /** live oracle price (USD) */
    price: number;
    /** hourly borrow cost of an open position, % of size (long side) */
    borrowHourlyPctLong: number;
    /** hourly borrow cost, % of size (short side) */
    borrowHourlyPctShort: number;
    maxLeverage: number;
    /** Pyth ticker (e.g. "Crypto.SOL/USD") — feeds the benchmarks candle API */
    pythTicker: string;
};

export type PerpPositionRow = {
    /** position account address — the close handle */
    positionKey: string;
    symbol: PerpSymbol;
    direction: "long" | "short";
    sizeUsd: number;
    collateralUsd: number;
    entryPrice: number;
    markPrice: number;
    liquidationPrice: number;
    leverage: number;
    /** unrealized PnL net of exit fees, USD */
    pnlUsd: number;
};

export type OpenQuote = {
    entryPrice: number;
    liquidationPrice: number;
    /** position size in the target token */
    sizeUi: number;
    sizeUsd: number;
    /** entry + volatility fees, USD */
    feesUsd: number;
    availableLiquidityUsd: number;
    leverage: number;
};

async function sdk() {
    return import("flash-sdk");
}
type FlashSdk = Awaited<ReturnType<typeof sdk>>;

// The SDK nests its own @solana/web3.js (pinned =1.98.2), so the app's
// Connection/PublicKey are a different TYPE identity than the SDK's (same
// runtime shape/wire protocol). This module is the boundary — cast here,
// nowhere else.
type SdkPublicKey = InstanceType<FlashSdk["PoolConfig"]>["poolAddress"];

/** Pubkey-only wallet: identifies the owner, refuses to sign (we never ask it to). */
function stubWallet(publicKey: PublicKey) {
    return {
        publicKey,
        signTransaction: () => Promise.reject(new Error("read-only wallet")),
        signAllTransactions: () => Promise.reject(new Error("read-only wallet")),
    };
}

type Venue = {
    client: PerpetualsClient;
    pools: Map<string, PoolConfig>; // poolName → config
};

let readVenue: Venue | null = null;
let tradeVenue: Venue | null = null;
let tradeAuthority: string | null = null;

async function makeVenue(connection: Connection, authority: PublicKey): Promise<Venue> {
    const flash = await sdk();
    const { AnchorProvider } = await import("@coral-xyz/anchor");

    const poolNames = [...new Set(PERP_MARKETS.map((m) => m.pool))];
    const pools = new Map(poolNames.map((n) => [n, flash.PoolConfig.fromIdsByName(n, "mainnet-beta")]));
    const first = pools.get(poolNames[0])!;

    const provider = new AnchorProvider(
        connection as unknown as ConstructorParameters<typeof AnchorProvider>[0],
        stubWallet(authority) as unknown as ConstructorParameters<typeof AnchorProvider>[1],
        { commitment: "confirmed" },
    );
    const client = new flash.PerpetualsClient(
        provider as unknown as ConstructorParameters<FlashSdk["PerpetualsClient"]>[0],
        first.programId,
        first.perpComposibilityProgramId,
        first.fbNftRewardProgramId,
        first.rewardDistributionProgram.programId,
        {},
        // useExtOracleAccount=false → the program's internal (Pyth-pushed)
        // oracle accounts, which is what the trading ixs settle against.
        false,
    );
    return { client, pools };
}

/** Read-only venue (throwaway pubkey — market data only). */
async function getReadVenue(connection: Connection): Promise<Venue> {
    if (readVenue) return readVenue;
    const { Keypair } = await import("@solana/web3.js");
    readVenue = await makeVenue(connection, Keypair.generate().publicKey);
    return readVenue;
}

/** Venue bound to the user's wallet address (extension or Swig — just a pubkey). */
async function getTradeVenue(connection: Connection, authority: PublicKey): Promise<Venue> {
    const key = authority.toBase58();
    if (tradeVenue && tradeAuthority === key) return tradeVenue;
    tradeVenue = await makeVenue(connection, authority);
    tradeAuthority = key;
    return tradeVenue;
}

/** Resolve a market symbol to its pool + long/short market configs + custodies. */
function resolveMarket(flash: FlashSdk, venue: Venue, symbol: PerpSymbol) {
    const def = PERP_MARKETS.find((m) => m.symbol === symbol);
    if (!def) throw new Error(`Unknown market ${symbol}`);
    const pool = venue.pools.get(def.pool)!;
    const target = pool.custodies.find((c) => c.symbol === symbol);
    if (!target) throw new Error(`No ${symbol} custody in ${def.pool}`);
    const usdc = pool.custodies.find((c) => c.symbol === "USDC")!;
    const markets = pool.markets.filter((m) => m.targetCustodyId === target.custodyId);
    // Long collateralizes in the target token itself; short in USDC.
    // (side is an anchor enum variant object, not a string.)
    const long = markets.find((m) => flash.isVariant(m.side, "long") && m.collateralCustodyId === target.custodyId);
    const short = markets.find((m) => flash.isVariant(m.side, "short") && m.collateralCustodyId === usdc.custodyId);
    if (!long || !short) throw new Error(`Missing long/short market for ${symbol}`);
    return { pool, target, usdc, long, short };
}

const oraclePriceUi = (price: BN, exponent: number | BN) =>
    Number(price.toString()) * 10 ** Number(exponent.toString());

const usd = (v: BN) => Number(v.toString()) / 10 ** USD_DECIMALS;

/** Decode the program's CustomOracle accounts for a set of custodies in one RPC call. */
async function fetchOraclePrices(
    venue: Venue,
    connection: Connection,
    custodies: CustodyConfig[],
): Promise<Map<string, { price: number; raw: { price: BN; expo: number; ema: BN; conf: BN; publishTime: BN } }>> {
    const infos = await connection.getMultipleAccountsInfo(
        custodies.map((c) => c.intOracleAccount as unknown as PublicKey),
    );
    const coder = venue.client.program.account.custody.coder.accounts;
    const out = new Map<string, { price: number; raw: { price: BN; expo: number; ema: BN; conf: BN; publishTime: BN } }>();
    infos.forEach((info, i) => {
        if (!info) return;
        const raw = coder.decode("customOracle", info.data);
        out.set(custodies[i].custodyAccount.toBase58(), { price: oraclePriceUi(raw.price, raw.expo), raw });
    });
    return out;
}

/** Market rows for the rail: live oracle price + borrow rates. */
export async function getMarkets(connection: Connection): Promise<PerpMarketRow[]> {
    const flash = await sdk();
    const venue = await getReadVenue(connection);

    const resolved = PERP_MARKETS.map((m) => ({ def: m, ...resolveMarket(flash, venue, m.symbol) }));
    // One custody list across all pools (dedup by account) for both the
    // oracle batch and the custody-account batch.
    const custodyByKey = new Map<string, CustodyConfig>();
    for (const r of resolved) {
        custodyByKey.set(r.target.custodyAccount.toBase58(), r.target);
        custodyByKey.set(r.usdc.custodyAccount.toBase58(), r.usdc);
    }
    const custodies = [...custodyByKey.values()];

    const [prices, custodyInfos] = await Promise.all([
        fetchOraclePrices(venue, connection, custodies),
        connection.getMultipleAccountsInfo(custodies.map((c) => c.custodyAccount as unknown as PublicKey)),
    ]);
    const coder = venue.client.program.account.custody.coder.accounts;
    const borrowHourlyPct = new Map<string, number>();
    custodyInfos.forEach((info, i) => {
        if (!info) return;
        const c = coder.decode("custody", info.data);
        // borrowRateState.currentRate is the hourly rate at RATE_DECIMALS.
        borrowHourlyPct.set(
            custodies[i].custodyAccount.toBase58(),
            (Number(c.borrowRateState.currentRate.toString()) / flash.RATE_POWER) * 100,
        );
    });

    return resolved.flatMap((r) => {
        const price = prices.get(r.target.custodyAccount.toBase58())?.price;
        if (!price) return [];
        return [{
            symbol: r.def.symbol,
            price,
            borrowHourlyPctLong: borrowHourlyPct.get(r.target.custodyAccount.toBase58()) ?? 0,
            borrowHourlyPctShort: borrowHourlyPct.get(r.usdc.custodyAccount.toBase58()) ?? 0,
            maxLeverage: Math.min(r.long.maxLev, r.short.maxLev),
            pythTicker: r.target.pythTicker,
        }];
    });
}

/** Decode custody accounts into SDK CustodyAccount objects (batched RPC). */
async function fetchCustodyAccounts(
    flash: FlashSdk,
    venue: Venue,
    connection: Connection,
    custodies: CustodyConfig[],
) {
    const infos = await connection.getMultipleAccountsInfo(
        custodies.map((c) => c.custodyAccount as unknown as PublicKey),
    );
    const coder = venue.client.program.account.custody.coder.accounts;
    const out = new Map<string, InstanceType<FlashSdk["CustodyAccount"]>>();
    infos.forEach((info, i) => {
        if (!info) return;
        out.set(
            custodies[i].custodyAccount.toBase58(),
            flash.CustodyAccount.from(custodies[i].custodyAccount, coder.decode("custody", info.data)),
        );
    });
    return out;
}

/** CustomOracle decode → the SDK's OraclePrice pair (spot + EMA). */
function toOraclePrices(
    flash: FlashSdk,
    BNCtor: typeof BN,
    raw: { price: BN; expo: number; ema: BN; conf: BN; publishTime: BN },
) {
    const exponent = new BNCtor(raw.expo);
    return {
        price: flash.OraclePrice.from({ price: raw.price, exponent, confidence: raw.conf, timestamp: raw.publishTime }),
        ema: flash.OraclePrice.from({ price: raw.ema, exponent, confidence: raw.conf, timestamp: raw.publishTime }),
    };
}

/** The wallet's open positions across all our pools, with live PnL. */
export async function getPositions(connection: Connection, owner: PublicKey): Promise<PerpPositionRow[]> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const venue = await getTradeVenue(connection, owner);
    const poolList = [...venue.pools.values()];

    const raw = await venue.client.getUserPositionsMultiPool(owner as unknown as SdkPublicKey, poolList);
    if (raw.length === 0) return [];

    const now = new BNCtor(Math.floor(Date.now() / 1000));
    const rows: PerpPositionRow[] = [];
    for (const p of raw) {
        const pool = poolList.find((pc) => pc.doesMarketExist(p.market));
        if (!pool) continue;
        const marketConfig = pool.getMarketConfigByPk(p.market);
        const target = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.targetCustody))!;
        const collateral = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.collateralCustody))!;
        const def = PERP_MARKETS.find((m) => m.symbol === target.symbol);
        if (!def) continue; // position on a market outside our curated list

        // All math is the SDK's client-side mirror of the contract (the
        // program's hosted view instructions are deprecated on mainnet).
        const [custodyAccts, oracles] = await Promise.all([
            fetchCustodyAccounts(flash, venue, connection, [target, collateral]),
            fetchOraclePrices(venue, connection, [target, collateral]),
        ]);
        const targetAcct = custodyAccts.get(target.custodyAccount.toBase58())!;
        const collateralAcct = custodyAccts.get(collateral.custodyAccount.toBase58())!;
        const targetOracle = toOraclePrices(flash, BNCtor, oracles.get(target.custodyAccount.toBase58())!.raw);
        const collateralOracle = toOraclePrices(flash, BNCtor, oracles.get(collateral.custodyAccount.toBase58())!.raw);

        const position = flash.PositionAccount.from(p.pubkey, p);
        const metrics = venue.client.getPositionMetrics(
            position,
            targetOracle.price, targetOracle.ema, targetAcct,
            collateralOracle.price, collateralOracle.ema, collateralAcct,
            now, pool,
        );

        const feesUsd = usd(metrics.fees.exitFeeUsd) + usd(metrics.fees.lockAndUnsettledFeeUsd);
        rows.push({
            positionKey: p.pubkey.toBase58(),
            symbol: def.symbol,
            direction: flash.isVariant(marketConfig.side, "long") ? "long" : "short",
            sizeUsd: usd(position.sizeUsd),
            collateralUsd: usd(position.collateralUsd),
            entryPrice: oraclePriceUi(position.entryPrice.price, position.entryPrice.exponent),
            markPrice: oracles.get(target.custodyAccount.toBase58())!.price,
            liquidationPrice: oraclePriceUi(metrics.liquidationPrice.price, metrics.liquidationPrice.exponent),
            leverage: Number(metrics.leverage.toString()) / 10 ** 4,
            pnlUsd: usd(metrics.pnl.profitUsd) - usd(metrics.pnl.lossUsd) - feesUsd,
        });
    }
    return rows;
}

/** Wallet USDC balance (Flash has no deposit account — the wallet IS the balance). */
export async function getUsdcBalance(connection: Connection, owner: PublicKey): Promise<number> {
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const ata = spl.getAssociatedTokenAddressSync(new PK(USDC_MINT_ADDRESS), owner, true);
    try {
        const bal = await connection.getTokenAccountBalance(ata);
        return bal.value.uiAmount ?? 0;
    } catch {
        return 0; // ATA doesn't exist
    }
}

/**
 * Quote an open, computed entirely client-side with the SDK's sync mirror of
 * the contract math (the program's hosted view instructions are deprecated
 * on mainnet — they return DeprecatedInstruction 6081). `usdcIn` is what
 * leaves the wallet; leverage is a UI multiplier (e.g. 5). Longs account for
 * the USDC→token swap fee.
 */
export async function getOpenQuote(
    connection: Connection,
    owner: PublicKey,
    symbol: PerpSymbol,
    direction: "long" | "short",
    usdcIn: number,
    leverage: number,
): Promise<OpenQuote & { sizeNative: string }> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const venue = await getTradeVenue(connection, owner);
    const { pool, target, usdc, long, short } = resolveMarket(flash, venue, symbol);
    const marketConfig: MarketConfig = direction === "long" ? long : short;
    const isLong = direction === "long";

    const amountIn = new BNCtor(Math.round(usdcIn * 10 ** USD_DECIMALS));
    const now = new BNCtor(Math.floor(Date.now() / 1000));

    const [custodyAccts, oracles, poolInfo] = await Promise.all([
        fetchCustodyAccounts(flash, venue, connection, [target, usdc]),
        fetchOraclePrices(venue, connection, [target, usdc]),
        connection.getAccountInfo(pool.poolAddress as unknown as PublicKey),
    ]);
    const targetAcct = custodyAccts.get(target.custodyAccount.toBase58())!;
    const usdcAcct = custodyAccts.get(usdc.custodyAccount.toBase58())!;
    const targetOracle = toOraclePrices(flash, BNCtor, oracles.get(target.custodyAccount.toBase58())!.raw);
    const usdcOracle = toOraclePrices(flash, BNCtor, oracles.get(usdc.custodyAccount.toBase58())!.raw);
    const collateralAcct = isLong ? targetAcct : usdcAcct;
    const collateralOracle = isLong ? targetOracle : usdcOracle;

    // Position size in the target token for the requested leverage. Longs
    // first swap USDC→token in the pool, so size against the swap output.
    let sizeAmount: BN;
    let collateralDelta: BN;
    if (isLong) {
        if (!poolInfo) throw new Error("Pool account missing");
        const poolAccount = flash.PoolAccount.from(
            pool.poolAddress,
            venue.client.program.account.pool.coder.accounts.decode("pool", poolInfo.data),
        );
        const swap = venue.client.getSwapAmountAndFeesSync(
            amountIn, new BNCtor(0), poolAccount,
            usdcOracle.price, usdcOracle.ema, usdcAcct,
            targetOracle.price, targetOracle.ema, targetAcct,
            poolAccount.rawAumUsd, pool,
        );
        collateralDelta = swap.minAmountOut;
        sizeAmount = venue.client.getSizeAmountFromLeverageAndCollateral(
            collateralDelta, String(leverage), pool.getTokenFromSymbol(target.symbol),
            pool.getTokenFromSymbol(target.symbol), flash.Side.Long,
            targetOracle.price, targetOracle.ema, targetAcct,
            targetOracle.price, targetOracle.ema, targetAcct,
        );
    } else {
        collateralDelta = amountIn;
        sizeAmount = venue.client.getSizeAmountFromLeverageAndCollateral(
            amountIn, String(leverage), pool.getTokenFromSymbol(target.symbol),
            pool.getTokenFromSymbol("USDC"), flash.Side.Short,
            targetOracle.price, targetOracle.ema, targetAcct,
            usdcOracle.price, usdcOracle.ema, usdcAcct,
        );
    }

    const entry = venue.client.getEntryPriceAndFeeSyncV2(
        null, marketConfig.marketCorrelation, collateralDelta, sizeAmount,
        isLong ? flash.Side.Long : flash.Side.Short,
        targetOracle.price, targetOracle.ema, targetAcct,
        collateralOracle.price, collateralOracle.ema, collateralAcct,
        now,
    );

    const entryPrice = Number(entry.entryAvgOraclePrice.toUiPrice(9));
    const sizeUi = Number(sizeAmount.toString()) / 10 ** target.decimals;
    const available = targetAcct.assets.owned.sub(targetAcct.assets.locked);

    return {
        entryPrice,
        liquidationPrice: Number(entry.liquidationPrice.toUiPrice(9)),
        sizeUi,
        sizeUsd: sizeUi * entryPrice,
        feesUsd: usd(entry.feeUsd) + usd(entry.vbFeeUsd),
        availableLiquidityUsd:
            (Number(available.toString()) / 10 ** target.decimals) *
            oracles.get(target.custodyAccount.toBase58())!.price,
        leverage,
        sizeNative: sizeAmount.toString(),
    };
}

// ─── Unsigned-transaction builders ──────────────────────────

async function buildTx(
    connection: Connection,
    feePayer: PublicKey,
    ixs: TransactionInstruction[],
): Promise<Transaction> {
    const { Transaction: Tx, ComputeBudgetProgram } = await import("@solana/web3.js");
    const { getRecommendedMicrolamports } = await import("@/lib/solana/priority-fees");
    const tx = new Tx();
    // Perps ixs are compute-heavy (swap + open in one ix): request headroom.
    // The Swig relay path strips-and-reapplies this limit on its side.
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: await getRecommendedMicrolamports([feePayer.toBase58()]),
    }));
    for (const ix of ixs) tx.add(ix);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    return tx;
}

/** The SDK's slippage bound: entry/exit-aware, side-aware, contract-encoded. */
function priceWithSlippage(
    venue: Venue,
    BNCtor: typeof BN,
    isEntry: boolean,
    oracle: { price: InstanceType<FlashSdk["OraclePrice"]> },
    side: unknown,
) {
    return venue.client.getPriceAfterSlippage(
        isEntry,
        new BNCtor(SLIPPAGE_BPS),
        oracle.price,
        side as Parameters<PerpetualsClient["getPriceAfterSlippage"]>[3],
    );
}

/**
 * Open a position. Longs: USDC is swapped to the target token and escrowed
 * as collateral in one tx (swapAndOpen). Shorts: USDC escrowed directly
 * (openPosition). Unsigned legacy tx.
 */
export async function prepareOpen(
    connection: Connection,
    owner: PublicKey,
    symbol: PerpSymbol,
    direction: "long" | "short",
    usdcIn: number,
    leverage: number,
    /** true only in tests: skip the SDK's wallet-balance preflight */
    skipBalanceChecks = false,
): Promise<Transaction> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const venue = await getTradeVenue(connection, owner);
    const { pool, long, short } = resolveMarket(flash, venue, symbol);

    const quote = await getOpenQuote(connection, owner, symbol, direction, usdcIn, leverage);
    const marketConfig = direction === "long" ? long : short;
    const target = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.targetCustody))!;

    const amountIn = new BNCtor(Math.round(usdcIn * 10 ** USD_DECIMALS));
    const sizeAmount = new BNCtor(quote.sizeNative);
    const side = direction === "long" ? flash.Side.Long : flash.Side.Short;

    const targetOracle = toOraclePrices(
        flash, BNCtor,
        [...(await fetchOraclePrices(venue, connection, [target])).values()][0].raw,
    );
    const pws = priceWithSlippage(venue, BNCtor, true, targetOracle, side);

    const built = direction === "long"
        ? await venue.client.swapAndOpen(
            target.symbol, target.symbol, "USDC",
            amountIn, pws,
            sizeAmount, flash.Side.Long, pool, flash.Privilege.None,
            undefined, undefined, skipBalanceChecks,
        )
        : await venue.client.openPosition(
            target.symbol, "USDC",
            pws,
            amountIn, sizeAmount, flash.Side.Short, pool, flash.Privilege.None,
            undefined, undefined, skipBalanceChecks,
        );

    if (built.additionalSigners.length > 0) {
        // Only the SOL-input path creates ephemeral signers; we always pay in
        // USDC, so this firing means the assumption broke — refuse to build a
        // tx the dual signing path can't complete.
        throw new Error("Unexpected ephemeral signer in open transaction");
    }
    return buildTx(connection, owner, built.instructions as unknown as TransactionInstruction[]);
}

/** Close a whole position back to wallet USDC. Unsigned legacy tx. */
export async function prepareClose(
    connection: Connection,
    owner: PublicKey,
    positionKey: string,
): Promise<Transaction> {
    const flash = await sdk();
    const venue = await getTradeVenue(connection, owner);

    const poolList = [...venue.pools.values()];
    const positions = await venue.client.getUserPositionsMultiPool(owner as unknown as SdkPublicKey, poolList);
    const p = positions.find((x) => x.pubkey.toBase58() === positionKey);
    if (!p) throw new Error("Position not found");

    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const pool = poolList.find((pc) => pc.doesMarketExist(p.market))!;
    const marketConfig = pool.getMarketConfigByPk(p.market);
    const target = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.targetCustody))!;
    const isLong = flash.isVariant(marketConfig.side, "long");

    const side = isLong ? flash.Side.Long : flash.Side.Short;
    const targetOracle = toOraclePrices(
        flash, BNCtor,
        [...(await fetchOraclePrices(venue, connection, [target])).values()][0].raw,
    );
    const pws = priceWithSlippage(venue, BNCtor, false, targetOracle, side);

    const built = isLong
        ? await venue.client.closeAndSwap(
            target.symbol, "USDC", target.symbol,
            pws,
            flash.Side.Long, pool, flash.Privilege.None,
        )
        : await venue.client.closePosition(
            target.symbol, "USDC",
            pws,
            flash.Side.Short, pool, flash.Privilege.None,
            undefined, undefined,
            true, // createUserATA — the USDC ATA may have been closed
        );

    if (built.additionalSigners.length > 0) {
        throw new Error("Unexpected ephemeral signer in close transaction");
    }
    return buildTx(connection, owner, built.instructions as unknown as TransactionInstruction[]);
}

/** Drop cached clients (route unmount). Flash clients hold no subscriptions. */
export function teardown(): void {
    readVenue = null;
    tradeVenue = null;
    tradeAuthority = null;
}
