// Flash Trade perps integration (v2 / Ephemeral Rollups) — client-side only,
// loaded lazily behind the /trade/perpetuals route (the speed rule).
//
// VENUE MODEL: Flash migrated trading onto a MagicBlock Ephemeral Rollup.
// The base layer only handles setup and money movement; trades execute on
// Flash's ER validator (https://flash.magicblock.xyz — public endpoint):
//
//   base layer (wallet-signed, dual path):  init deposit ledger + basket,
//     create session, delegate basket, depositDirect / withdrawal
//   ER (signed by a LOCAL SESSION KEY, no wallet prompt):  open / close /
//     modify positions, quotes, basket + position reads
//
// The session key is a throwaway keypair stored in localStorage and
// authorized on-chain by the wallet ONCE (MagicBlock session-keys program).
// This is what makes both wallet types work: Swig-execute doesn't exist on
// the ER, so Swig wallets could never sign there — but they can sign the
// base-layer session grant, and after that trading needs no wallet at all.
// (Bonus: extension users stop getting a popup per trade.)
//
// The old base-layer trading path (flash-sdk v1) is DEAD on mainnet — every
// trading/view/stake instruction returns DeprecatedInstruction 6081.
import type { Connection, PublicKey, Transaction, TransactionInstruction, Keypair } from "@solana/web3.js";
import type { FlashPerpetualsClient, PoolConfig, MarketConfig } from "@flash_trade/flash-sdk-v2";
import type BN from "bn.js";

export const ER_ENDPOINT =
    process.env.NEXT_PUBLIC_FLASH_ER_RPC ?? "https://flash.magicblock.xyz";

/**
 * Curated market list — majors + the memes our traders actually know.
 * Each entry names the Flash pool that lists the pair.
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

/**
 * watchparty's Flash referrer: the treasury's delegated token_stake earns
 * 2.5%–10% of referred traders' fees (tier scales with FAF staked). Created
 * on-chain 2026-07-17 by scripts/perps/setup-flash-referrer.ts. Onboarding
 * points each trader's Referral account here; every trade then carries
 * Privilege.Referral. Unset env = no referral tail, trades still work.
 */
const REFERRER_PUBKEY = process.env.NEXT_PUBLIC_TREASURY_PUBKEY;

export type PerpMarketRow = {
    symbol: PerpSymbol;
    /** live oracle price (USD), read from the ER (base copies can be stale) */
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
    /** market account address — the close handle */
    marketKey: string;
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
    feesUsd: number;
    availableLiquidityUsd: number;
    leverage: number;
    sizeNative: string;
};

/** Where the user is in the one-time Flash onboarding. */
export type PerpsAccountState = {
    /** deposit ledger + basket + session all live — trading enabled */
    ready: boolean;
    /** USDC sitting in the Flash deposit ledger (the trading balance) */
    ledgerUsdc: number;
    /** USDC in the wallet itself (available to deposit) */
    walletUsdc: number;
    /** base accounts (ledger/basket) missing — first-visit setup needed */
    needsSetup: boolean;
    /** an on-chain session grant matching the stored local key exists */
    sessionValid: boolean;
};

async function sdk() {
    return import("@flash_trade/flash-sdk-v2");
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
    client: FlashPerpetualsClient;
    pools: Map<string, PoolConfig>;
};

let readVenue: Venue | null = null;
let tradeVenue: Venue | null = null;
let tradeAuthority: string | null = null;

async function makeVenue(connection: Connection, authority: PublicKey): Promise<Venue> {
    const flash = await sdk();
    const { AnchorProvider } = await import("@coral-xyz/anchor");

    const poolNames = [...new Set(PERP_MARKETS.map((m) => m.pool))];
    const pools = new Map(poolNames.map((n) => [n, flash.PoolConfig.fromIdsByName(n, "mainnet-beta")]));

    const provider = new AnchorProvider(
        connection as unknown as ConstructorParameters<typeof AnchorProvider>[0],
        stubWallet(authority) as unknown as ConstructorParameters<typeof AnchorProvider>[1],
        { commitment: "confirmed" },
    );
    const client = new flash.FlashPerpetualsClient(
        provider as unknown as ConstructorParameters<FlashSdk["FlashPerpetualsClient"]>[0],
        undefined, // bundled IDL
        flash.PROGRAM_ID["mainnet-beta"],
        {},
        ER_ENDPOINT,
    );
    return { client, pools };
}

async function getReadVenue(connection: Connection): Promise<Venue> {
    if (readVenue) return readVenue;
    const { Keypair: KP } = await import("@solana/web3.js");
    readVenue = await makeVenue(connection, KP.generate().publicKey);
    return readVenue;
}

async function getTradeVenue(connection: Connection, authority: PublicKey): Promise<Venue> {
    const key = authority.toBase58();
    if (tradeVenue && tradeAuthority === key) return tradeVenue;
    tradeVenue = await makeVenue(connection, authority);
    tradeAuthority = key;
    return tradeVenue;
}

function resolveMarket(flash: FlashSdk, venue: Venue, symbol: PerpSymbol, direction: "long" | "short") {
    const def = PERP_MARKETS.find((m) => m.symbol === symbol);
    if (!def) throw new Error(`Unknown market ${symbol}`);
    const pool = venue.pools.get(def.pool)!;
    const side = direction === "long" ? flash.Side.Long : flash.Side.Short;
    // Longs may lock a wrapped/LST variant (e.g. SOL longs lock JitoSOL) —
    // the client resolves the effective lock symbol; shorts lock USDC.
    const lockSymbol = venue.client.resolveCollateralSymbol(
        symbol,
        direction === "long" ? symbol : "USDC",
        side,
    );
    const marketConfig = venue.client.findMarketConfig(pool, symbol, lockSymbol, side);
    const target = pool.custodies.find((c) => c.symbol === symbol)!;
    return { pool, side, lockSymbol, marketConfig, target };
}

const oraclePriceUi = (price: BN, exponent: number | BN) =>
    Number(price.toString()) * 10 ** Number(exponent.toString());

const usd = (v: BN) => Number(v.toString()) / 10 ** USD_DECIMALS;

/**
 * Batched CustomOracle + Custody reads. Delegated accounts live on the ER —
 * read them there (the docs' own pattern: `erProgram ?? program`).
 */
async function erConn(venue: Venue): Promise<Connection> {
    return (venue.client.erConnection ?? venue.client.connection) as unknown as Connection;
}

// ─── Session keys (localStorage, one per authority) ─────────

const SESSION_STORE_PREFIX = "flash-perps-session:";

async function loadSessionKeypair(authority: PublicKey): Promise<Keypair | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SESSION_STORE_PREFIX + authority.toBase58());
    if (!raw) return null;
    try {
        const { Keypair: KP } = await import("@solana/web3.js");
        return KP.fromSecretKey(Buffer.from(raw, "base64"));
    } catch {
        return null;
    }
}

async function ensureSessionKeypair(authority: PublicKey): Promise<Keypair> {
    const existing = await loadSessionKeypair(authority);
    if (existing) return existing;
    const { Keypair: KP } = await import("@solana/web3.js");
    const kp = KP.generate();
    localStorage.setItem(
        SESSION_STORE_PREFIX + authority.toBase58(),
        Buffer.from(kp.secretKey).toString("base64"),
    );
    return kp;
}

/** The on-chain session-token PDA for the stored local key, if any. */
async function sessionTokenFor(
    flash: FlashSdk,
    venue: Venue,
    authority: PublicKey,
): Promise<{ keypair: Keypair; token: PublicKey } | null> {
    const keypair = await loadSessionKeypair(authority);
    if (!keypair) return null;
    const [token] = flash.findSessionTokenAddress(
        flash.PROGRAM_ID["mainnet-beta"],
        keypair.publicKey as unknown as SdkPublicKey,
        authority as unknown as SdkPublicKey,
    );
    return { keypair, token: token as unknown as PublicKey };
}

// ─── Referral ───────────────────────────────────────────────

/** Cached per-authority: does this trader's Referral account exist on-chain? */
const referralExists = new Map<string, boolean>();

/**
 * The referral tail for a trade: [Privilege.Referral, trader's Referral PDA,
 * treasury's token_stake]. Null (→ Privilege.None, full fee, no rebate) when
 * the referrer env is unset or the trader hasn't onboarded through us.
 */
async function referralArgs(flash: FlashSdk, connection: Connection, owner: PublicKey) {
    if (!REFERRER_PUBKEY) return null;
    const key = owner.toBase58();
    const { PublicKey: PK } = await import("@solana/web3.js");
    const [referralPda] = flash.findReferralAddress(owner as unknown as SdkPublicKey);
    if (!referralExists.get(key)) {
        const info = await connection.getAccountInfo(referralPda as unknown as PublicKey);
        referralExists.set(key, !!info);
        if (!info) return null;
    }
    const [tokenStake] = flash.findTokenStakeAddress(new PK(REFERRER_PUBKEY) as unknown as SdkPublicKey);
    return { privilege: flash.Privilege.Referral, referralAccount: referralPda, tokenStakeAccount: tokenStake };
}

// ─── Reads ──────────────────────────────────────────────────

/** Market rows for the rail: live ER oracle price + borrow rates. */
export async function getMarkets(connection: Connection): Promise<PerpMarketRow[]> {
    const flash = await sdk();
    const venue = await getReadVenue(connection);
    const er = await erConn(venue);

    const resolved = PERP_MARKETS.map((m) => {
        const long = resolveMarket(flash, venue, m.symbol, "long");
        const short = resolveMarket(flash, venue, m.symbol, "short");
        const usdc = long.pool.custodies.find((c) => c.symbol === "USDC")!;
        const lock = long.pool.custodies.find((c) => c.symbol === long.lockSymbol)!;
        return { def: m, long, short, usdc, lock };
    });

    // One dedup'd account list across pools: target+lock+usdc custodies and
    // the targets' internal oracles.
    const custodyByKey = new Map<string, { account: PublicKey; oracle: PublicKey }>();
    for (const r of resolved) {
        for (const c of [r.long.target, r.lock, r.usdc]) {
            custodyByKey.set(c.custodyAccount.toBase58(), {
                account: c.custodyAccount as unknown as PublicKey,
                oracle: c.intOracleAccount as unknown as PublicKey,
            });
        }
    }
    const keys = [...custodyByKey.keys()];
    const entries = [...custodyByKey.values()];
    const infos = await er.getMultipleAccountsInfo([
        ...entries.map((e) => e.oracle),
        ...entries.map((e) => e.account),
    ]);

    const coder = venue.client.program.coder.accounts;
    const price = new Map<string, number>();
    const borrow = new Map<string, number>();
    infos.forEach((info, i) => {
        if (!info) return;
        if (i < entries.length) {
            const o = coder.decode("customOracle", info.data);
            price.set(keys[i], oraclePriceUi(o.price, o.expo));
        } else {
            const c = coder.decode("custody", info.data);
            // borrowRateState.currentRate is the hourly rate at 1e9.
            borrow.set(keys[i - entries.length], (Number(c.borrowRateState.currentRate.toString()) / 1e9) * 100);
        }
    });

    return resolved.flatMap((r) => {
        const p = price.get(r.long.target.custodyAccount.toBase58());
        if (!p) return [];
        return [{
            symbol: r.def.symbol,
            price: p,
            borrowHourlyPctLong: borrow.get(r.lock.custodyAccount.toBase58()) ?? 0,
            borrowHourlyPctShort: borrow.get(r.usdc.custodyAccount.toBase58()) ?? 0,
            maxLeverage: Math.min(r.long.marketConfig.maxLev, r.short.marketConfig.maxLev),
            pythTicker: r.long.target.pythTicker,
        }];
    });
}

/** Onboarding + balances snapshot for the wallet. */
export async function getAccountState(connection: Connection, owner: PublicKey): Promise<PerpsAccountState> {
    const flash = await sdk();
    const spl = await import("@solana/spl-token");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const venue = await getTradeVenue(connection, owner);

    const usdcMint = new PK(USDC_MINT_ADDRESS);
    const [ledgerPda] = flash.findUserDepositLedgerAddress(owner as unknown as SdkPublicKey);
    const [basketPda] = flash.findBasketAddress(owner as unknown as SdkPublicKey);
    const session = await sessionTokenFor(flash, venue, owner);

    const ata = spl.getAssociatedTokenAddressSync(usdcMint, owner, true);
    const [ledgerInfo, basketInfo, sessionInfo, walletBal] = await Promise.all([
        connection.getAccountInfo(ledgerPda as unknown as PublicKey),
        connection.getAccountInfo(basketPda as unknown as PublicKey),
        session ? connection.getAccountInfo(session.token) : Promise.resolve(null),
        connection.getTokenAccountBalance(ata).catch(() => null),
    ]);

    let ledgerUsdc = 0;
    if (ledgerInfo) {
        const ledger = venue.client.program.coder.accounts.decode("userDepositLedger", ledgerInfo.data);
        for (const d of ledger.deposits as { mint: { toBase58(): string }; amount: BN }[]) {
            if (d.mint.toBase58() === USDC_MINT_ADDRESS) ledgerUsdc += usd(d.amount);
        }
    }

    const sessionValid = !!sessionInfo;
    return {
        ready: !!ledgerInfo && !!basketInfo && sessionValid,
        ledgerUsdc,
        walletUsdc: walletBal?.value.uiAmount ?? 0,
        needsSetup: !ledgerInfo || !basketInfo,
        sessionValid,
    };
}

/** The wallet's open positions (basket on the ER), with live PnL. */
export async function getPositions(connection: Connection, owner: PublicKey): Promise<PerpPositionRow[]> {
    const flash = await sdk();
    const venue = await getTradeVenue(connection, owner);
    const fetcher = venue.client.erAccounts ?? venue.client.accounts;

    let basket;
    try {
        basket = await fetcher.fetchBasket(owner as unknown as SdkPublicKey);
    } catch {
        return []; // no basket yet
    }

    const poolList = [...venue.pools.values()];
    const rows: PerpPositionRow[] = [];
    for (const meta of basket.positions) {
        const pool = poolList.find((pc) => pc.markets.some((m) => m.marketAccount.equals(meta.market)));
        if (!pool) continue;
        const marketConfig = pool.markets.find((m) => m.marketAccount.equals(meta.market))!;
        const target = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.targetCustody))!;
        const collateral = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.collateralCustody))!;
        const def = PERP_MARKETS.find((m) => m.symbol === target.symbol);
        if (!def) continue;

        // The program's own view, simulated against the ER — PnL/leverage/liq
        // exactly as the contract computes them.
        const data = await venue.client.views.getPositionDataEr(pool, {
            owner: owner as unknown as SdkPublicKey,
            market: meta.market,
            targetSymbol: target.symbol,
            collateralSymbol: collateral.symbol,
        });

        const er = await erConn(venue);
        const oracleInfo = await er.getAccountInfo(target.intOracleAccount as unknown as PublicKey);
        const markPrice = oracleInfo
            ? (() => { const o = venue.client.program.coder.accounts.decode("customOracle", oracleInfo.data); return oraclePriceUi(o.price, o.expo); })()
            : 0;

        rows.push({
            marketKey: meta.market.toBase58(),
            symbol: def.symbol,
            direction: flash.isVariant(marketConfig.side, "long") ? "long" : "short",
            sizeUsd: usd(data.sizeUsd),
            collateralUsd: usd(data.collateralUsd),
            entryPrice: oraclePriceUi(data.entryOraclePrice.price, data.entryOraclePrice.exponent),
            markPrice,
            liquidationPrice: oraclePriceUi(data.liquidationPrice.price, data.liquidationPrice.exponent),
            leverage: Number(data.leverage.toString()) / 10 ** 4,
            pnlUsd: usd(data.pnlWithFeeUsd),
        });
    }
    return rows;
}

/** Live open quote from the program's ER view (read-only simulation). */
export async function getOpenQuote(
    connection: Connection,
    owner: PublicKey,
    symbol: PerpSymbol,
    direction: "long" | "short",
    usdcIn: number,
    leverage: number,
): Promise<OpenQuote> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const venue = await getTradeVenue(connection, owner);
    const { pool, lockSymbol, marketConfig, target } = resolveMarket(flash, venue, symbol, direction);

    const q = await venue.client.views.getOpenPositionQuoteEr(pool, {
        market: marketConfig.marketAccount,
        targetSymbol: symbol,
        collateralSymbol: lockSymbol,
        receivingSymbol: "USDC",
        amountIn: new BNCtor(Math.round(usdcIn * 10 ** USD_DECIMALS)),
        leverage: new BNCtor(Math.round(leverage * 10 ** 4)),
        owner: owner as unknown as SdkPublicKey,
    });

    const sizeUi = Number(q.sizeAmount.toString()) / 10 ** target.decimals;
    const entryPrice = oraclePriceUi(q.entryPrice.price, q.entryPrice.exponent);
    return {
        entryPrice,
        liquidationPrice: oraclePriceUi(q.liquidationPrice.price, q.liquidationPrice.exponent),
        sizeUi,
        sizeUsd: usd(q.sizeUsd),
        feesUsd: usd(q.totalFeeUsd),
        availableLiquidityUsd: usd(q.availableLiquidityUsd),
        leverage,
        sizeNative: q.sizeAmount.toString(),
    };
}

// ─── Base-layer transactions (wallet-signed, unsigned here) ─

async function buildTx(
    connection: Connection,
    feePayer: PublicKey,
    ixs: TransactionInstruction[],
): Promise<Transaction> {
    const { Transaction: Tx, ComputeBudgetProgram } = await import("@solana/web3.js");
    const { getRecommendedMicrolamports } = await import("@/lib/solana/priority-fees");
    const tx = new Tx();
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: await getRecommendedMicrolamports([feePayer.toBase58()]),
    }));
    for (const ix of ixs) tx.add(ix);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer;
    return tx;
}

/**
 * One-time onboarding, phase 1 (wallet only): deposit ledger + basket +
 * basket delegation + the trader's Referral account (pointing at the
 * watchparty referrer — earns the platform a fee rebate on every trade).
 * Idempotent — already-existing accounts contribute no instructions;
 * returns null when there's nothing to do.
 */
export async function prepareSetup(connection: Connection, owner: PublicKey): Promise<Transaction | null> {
    const flash = await sdk();
    const venue = await getTradeVenue(connection, owner);
    const ixs: TransactionInstruction[] = [];
    for (const r of [
        await venue.client.initializeUserDepositLedger(),
        await venue.client.initializeBasket(),
        await venue.client.delegateBasket(owner as unknown as SdkPublicKey),
    ]) {
        ixs.push(...(r.instructions as unknown as TransactionInstruction[]));
    }

    if (REFERRER_PUBKEY) {
        const { PublicKey: PK } = await import("@solana/web3.js");
        const [referralPda] = flash.findReferralAddress(owner as unknown as SdkPublicKey);
        if (!(await connection.getAccountInfo(referralPda as unknown as PublicKey))) {
            const [tokenStake] = flash.findTokenStakeAddress(new PK(REFERRER_PUBKEY) as unknown as SdkPublicKey);
            const ix = await venue.client.program.methods
                .createReferral({})
                .accountsPartial({
                    owner: owner as unknown as SdkPublicKey,
                    feePayer: owner as unknown as SdkPublicKey,
                    tokenStakeAccount: tokenStake,
                    referralAccount: referralPda,
                })
                .instruction();
            ixs.push(ix as unknown as TransactionInstruction);
            referralExists.set(owner.toBase58(), true);
        }
    }

    if (ixs.length === 0) return null;
    return buildTx(connection, owner, ixs);
}

/**
 * One-time onboarding, phase 2: authorize a local session key for trading.
 * The returned tx must be signed by BOTH the wallet (owner) and the returned
 * session keypair (the view co-signs with it before submitting).
 */
export async function prepareSession(
    connection: Connection,
    owner: PublicKey,
): Promise<{ tx: Transaction; sessionKeypair: Keypair } | null> {
    const flash = await sdk();
    const venue = await getTradeVenue(connection, owner);

    const existing = await sessionTokenFor(flash, venue, owner);
    if (existing && (await connection.getAccountInfo(existing.token))) return null; // already active

    const sessionKeypair = await ensureSessionKeypair(owner);
    const r = await venue.client.createSession(
        sessionKeypair.publicKey as unknown as SdkPublicKey,
        false,
        undefined,
        { skipExistingSessionTokenCheck: true },
    );
    const tx = await buildTx(connection, owner, r.instructions as unknown as TransactionInstruction[]);
    return { tx, sessionKeypair };
}

/** Move wallet USDC into the Flash deposit ledger. Unsigned base-layer tx. */
export async function prepareDeposit(
    connection: Connection,
    owner: PublicKey,
    usdAmount: number,
): Promise<Transaction> {
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const venue = await getTradeVenue(connection, owner);
    const r = await venue.client.depositDirect(
        new PK(USDC_MINT_ADDRESS) as unknown as SdkPublicKey,
        new BNCtor(Math.round(usdAmount * 10 ** USD_DECIMALS)),
    );
    return buildTx(connection, owner, r.instructions as unknown as TransactionInstruction[]);
}

/**
 * Move ledger USDC back to the wallet. Two-phase on Flash (WithAction queues
 * the ER-side release, a keeper settles). The session key co-signs as the
 * escrow fee payer (it must differ from the owner), so the view submits this
 * like the session grant: wallet + session keypair.
 */
export async function prepareWithdraw(
    connection: Connection,
    owner: PublicKey,
    usdAmount: number,
): Promise<{ tx: Transaction; sessionKeypair: Keypair }> {
    const flash = await sdk();
    const spl = await import("@solana/spl-token");
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const venue = await getTradeVenue(connection, owner);

    const session = await sessionTokenFor(flash, venue, owner);
    if (!session) throw new Error("Set up trading first");

    const usdcMint = new PK(USDC_MINT_ADDRESS);
    const ata = spl.getAssociatedTokenAddressSync(usdcMint, owner, true);
    const ixs: TransactionInstruction[] = [
        // The destination ATA may have been closed — recreate idempotently.
        spl.createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, usdcMint),
    ];
    const r = await venue.client.withdrawalWithAction(
        usdcMint as unknown as SdkPublicKey,
        ata as unknown as SdkPublicKey,
        new BNCtor(Math.round(usdAmount * 10 ** USD_DECIMALS)),
        session.keypair.publicKey as unknown as SdkPublicKey,
    );
    ixs.push(...(r.instructions as unknown as TransactionInstruction[]));
    return { tx: await buildTx(connection, owner, ixs), sessionKeypair: session.keypair };
}

// ─── ER trades (session-signed inside the module, no wallet) ─

async function useSessionOrThrow(flash: FlashSdk, venue: Venue, owner: PublicKey) {
    const session = await sessionTokenFor(flash, venue, owner);
    if (!session) throw new Error("Trading session missing — set up trading first");
    venue.client.useSession(session.keypair.publicKey as unknown as SdkPublicKey);
    return session;
}

async function erOraclePrice(flash: FlashSdk, venue: Venue, target: { intOracleAccount: unknown }) {
    const er = await erConn(venue);
    const info = await er.getAccountInfo(target.intOracleAccount as PublicKey);
    if (!info) throw new Error("No oracle price");
    return venue.client.program.coder.accounts.decode("customOracle", info.data);
}

/**
 * Program error 6024 (CustodyAmountLimit) = Flash's funding vaults are at
 * cap until their keeper next settles them into pool custodies. It hits ALL
 * traders (verified 2026-07-17: every market/pool/funding token at once,
 * with permissions open and pool ratios far under max) and self-heals.
 * Surface it as "try again shortly", not a scary failure.
 */
function friendlyTradeError(err: unknown): Error {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("6024") || msg.includes("CustodyAmountLimit")) {
        return new Error("Flash is at capacity for this market right now — usually clears within minutes. Try again shortly.");
    }
    if (msg.includes("6023") || msg.includes("MinLeverage")) {
        return new Error("Position too small for this leverage — raise the amount or leverage.");
    }
    return err instanceof Error ? err : new Error(msg);
}

/** Open a position: quote → build → session-sign → send to the ER. */
export async function openPosition(
    connection: Connection,
    owner: PublicKey,
    symbol: PerpSymbol,
    direction: "long" | "short",
    usdcIn: number,
    leverage: number,
): Promise<string> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const venue = await getTradeVenue(connection, owner);
    const session = await useSessionOrThrow(flash, venue, owner);
    const { pool, side, lockSymbol, target } = resolveMarket(flash, venue, symbol, direction);

    const quote = await getOpenQuote(connection, owner, symbol, direction, usdcIn, leverage);
    const oracle = await erOraclePrice(flash, venue, target);
    const price = venue.client.getPriceAfterSlippage(
        true,
        new BNCtor(SLIPPAGE_BPS),
        { price: oracle.price, exponent: new BNCtor(oracle.expo) },
        side,
    );

    const referral = await referralArgs(flash, connection, owner);
    const { instructions } = await venue.client.openPosition(
        symbol,
        lockSymbol,
        "USDC", // funded from the ledger's USDC; the program swaps to the lock custody
        side,
        pool,
        price,
        new BNCtor(Math.round(usdcIn * 10 ** USD_DECIMALS)),
        new BNCtor(quote.sizeNative),
        referral?.privilege,
        referral?.referralAccount,
        referral?.tokenStakeAccount,
    );
    try {
        return await venue.client.sendErTransaction(
            instructions,
            [session.keypair as unknown as Parameters<FlashPerpetualsClient["sendErTransaction"]>[1][number]],
        );
    } catch (err) {
        throw friendlyTradeError(err);
    }
}

/** Close a whole position (and clear its trigger orders). ER, session-signed. */
export async function closePosition(
    connection: Connection,
    owner: PublicKey,
    row: PerpPositionRow,
): Promise<string> {
    const flash = await sdk();
    const { BN: BNCtor } = await import("@coral-xyz/anchor");
    const { PublicKey: PK } = await import("@solana/web3.js");
    const venue = await getTradeVenue(connection, owner);
    const session = await useSessionOrThrow(flash, venue, owner);

    const poolList = [...venue.pools.values()];
    const marketPk = new PK(row.marketKey);
    const pool = poolList.find((pc) => pc.markets.some((m) => m.marketAccount.equals(marketPk as unknown as SdkPublicKey)))!;
    const marketConfig: MarketConfig = pool.markets.find((m) => m.marketAccount.equals(marketPk as unknown as SdkPublicKey))!;
    const target = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.targetCustody))!;
    const collateral = pool.custodies.find((c) => c.custodyAccount.equals(marketConfig.collateralCustody))!;
    const side = flash.isVariant(marketConfig.side, "long") ? flash.Side.Long : flash.Side.Short;

    const oracle = await erOraclePrice(flash, venue, target);
    const price = venue.client.getPriceAfterSlippage(
        false,
        new BNCtor(SLIPPAGE_BPS),
        { price: oracle.price, exponent: new BNCtor(oracle.expo) },
        side,
    );

    const referral = await referralArgs(flash, connection, owner);
    const { instructions } = await venue.client.closePosition(
        target.symbol, collateral.symbol, side, pool, price,
        "USDC", // proceeds land back in the ledger as USDC
        referral?.privilege,
        referral?.referralAccount,
        referral?.tokenStakeAccount,
    );
    const { instructions: cancelIxs } = await venue.client.cancelAllTriggerOrders(
        marketPk as unknown as SdkPublicKey,
    );
    try {
        return await venue.client.sendErTransaction(
            [...instructions, ...cancelIxs],
            [session.keypair as unknown as Parameters<FlashPerpetualsClient["sendErTransaction"]>[1][number]],
        );
    } catch (err) {
        throw friendlyTradeError(err);
    }
}

/** Drop cached clients (route unmount). */
export function teardown(): void {
    readVenue = null;
    tradeVenue = null;
    tradeAuthority = null;
}
