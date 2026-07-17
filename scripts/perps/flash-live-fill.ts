// LIVE FILL TEST — proves Flash v2 ER fills end-to-end with real (tiny) money.
//
//   bun scripts/perps/flash-live-fill.ts
//
// Treasury-signed, owner-signed ER path (the docs' bot path — no session key
// needed when the owner keypair signs directly). Stages, each idempotent:
//   1. base setup: deposit ledger + basket + delegateBasket
//   2. depositDirect 0.08 native SOL into the ledger
//   3. ER: open SOL long, ~half the ledger SOL as collateral @ 2x
//   4. ER: close it (proceeds back to ledger as SOL)
//   5. withdrawalWithAction back to the wallet (co-signed by a funded
//      throwaway — the escrow fee payer must differ from the owner)
//
// Money at risk: ~0.08 SOL deposited, entry+exit fees (~$0.02) + rent.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
    FlashPerpetualsClient,
    PoolConfig,
    PROGRAM_ID,
    Privilege,
    Side,
    findBasketAddress,
    findReferralAddress,
    findTokenStakeAddress,
    findUserDepositLedgerAddress,
} from "@flash_trade/flash-sdk-v2";

const ER_ENDPOINT = process.env.NEXT_PUBLIC_FLASH_ER_RPC ?? "https://flash.magicblock.xyz";
const DEPOSIT_SOL = 0.05;

function parseKeypair(raw: string): Keypair {
    const val = raw.trim();
    if (val.startsWith("[")) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(val)));
    try {
        const b64 = Buffer.from(val, "base64");
        if (b64.length === 64) return Keypair.fromSecretKey(new Uint8Array(b64));
    } catch { /* fall through */ }
    const bs58 = require("bs58");
    return Keypair.fromSecretKey(bs58.decode(val));
}

const rpc =
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL ??
    process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
if (!rpc) throw new Error("No mainnet RPC configured");
if (!process.env.TREASURY_PRIVATE_KEY) throw new Error("TREASURY_PRIVATE_KEY not set");

async function main() {
    const connection = new Connection(rpc!, "confirmed");
    const treasury = parseKeypair(process.env.TREASURY_PRIVATE_KEY!);
    const owner = treasury.publicKey;
    console.log("owner:", owner.toBase58(), "| SOL:", (await connection.getBalance(owner)) / LAMPORTS_PER_SOL);

    // The SDK signs both legacy and versioned txs through this wallet.
    const signAny = <T,>(tx: T): T => {
        const t = tx as { partialSign?: (kp: Keypair) => void; sign?: (kps: Keypair[]) => void };
        if (typeof t.partialSign === "function") t.partialSign(treasury);
        else t.sign?.([treasury]);
        return tx;
    };
    const wallet = {
        publicKey: owner,
        signTransaction: async <T,>(tx: T) => signAny(tx),
        signAllTransactions: async <T,>(txs: T[]) => txs.map(signAny),
    };
    const provider = new AnchorProvider(
        connection as ConstructorParameters<typeof AnchorProvider>[0],
        wallet as ConstructorParameters<typeof AnchorProvider>[1],
        { commitment: "confirmed" },
    );
    const client = new FlashPerpetualsClient(
        provider as ConstructorParameters<typeof FlashPerpetualsClient>[0],
        undefined,
        PROGRAM_ID["mainnet-beta"],
        { prioritizationFee: 50_000 },
        ER_ENDPOINT,
    );
    const pool = PoolConfig.fromIdsByName("Crypto.1", "mainnet-beta");

    type IxResult = { instructions: unknown[]; additionalSigners?: unknown[] };
    const sendBase = async (label: string, r: IxResult) => {
        if (r.instructions.length === 0) { console.log(`${label}: nothing to do`); return null; }
        const sig = await client.sendAndConfirmTransaction(
            r.instructions as Parameters<FlashPerpetualsClient["sendAndConfirmTransaction"]>[0],
            { additionalSigners: (r.additionalSigners ?? []) as never[] },
        );
        console.log(`${label}:`, sig);
        return sig;
    };

    // ── 1. base setup (idempotent — done accounts contribute no ixs) ──
    const [ledgerPda] = findUserDepositLedgerAddress(owner);
    const [basketPda] = findBasketAddress(owner);
    await sendBase("setup: deposit ledger", await client.initializeUserDepositLedger());
    await sendBase("setup: basket", await client.initializeBasket());
    await sendBase("setup: delegate basket", await client.delegateBasket(owner));

    // Referral, exactly as the app onboards traders: the owner's Referral
    // account pointing at the watchparty referrer's token_stake, and every
    // trade below carries Privilege.Referral. (Here owner == referrer, i.e.
    // a self-referral — structurally identical to a real trader's.)
    const referrer = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY ?? owner.toBase58());
    const [tokenStake] = findTokenStakeAddress(referrer);
    const [referralPda] = findReferralAddress(owner);
    if (!(await connection.getAccountInfo(new PublicKey(referralPda.toBase58())))) {
        const ix = await client.program.methods.createReferral({}).accountsPartial({
            owner, feePayer: owner, tokenStakeAccount: tokenStake, referralAccount: referralPda,
        }).instruction();
        await sendBase("setup: referral account", { instructions: [ix] });
    } else {
        console.log("setup: referral account exists");
    }
    const referralTail = [Privilege.Referral, referralPda, tokenStake] as const;

    // ── 2. fund the ledger with native SOL ──
    const ledgerSol = async () => {
        try {
            const ledger = await client.accounts.fetchUserDepositLedger(owner);
            const entry = (ledger.deposits as { mint: PublicKey; amount: BN }[])
                .find((d) => d.mint.equals(NATIVE_MINT));
            return entry ? Number(entry.amount.toString()) / LAMPORTS_PER_SOL : 0;
        } catch { return 0; }
    };
    let bal = await ledgerSol();
    console.log("ledger SOL:", bal);
    if (bal < DEPOSIT_SOL * 0.9) {
        await sendBase(
            `deposit ${DEPOSIT_SOL} SOL`,
            await client.depositDirect(NATIVE_MINT, new BN(Math.round(DEPOSIT_SOL * LAMPORTS_PER_SOL))),
        );
        bal = await ledgerSol();
        console.log("ledger SOL now:", bal);
    }

    // ── 3. open SOL long @2x, funded with ledger SOL ──
    const lockSymbol = client.resolveCollateralSymbol("SOL", "SOL", Side.Long);
    const mkt = client.findMarketConfig(pool, "SOL", lockSymbol, Side.Long);
    const solCustody = pool.custodies.find((c) => c.symbol === "SOL")!;
    // The SDK nests its own web3.js (different type identity, same runtime
    // shape) and its anchor namespace is untyped — cast at this boundary.
    const fetchOracle = () =>
        (client.erProgram!.account as unknown as { customOracle: { fetch: (a: PublicKey) => Promise<{ price: BN; expo: number }> } })
            .customOracle.fetch(solCustody.intOracleAccount);
    const erSigners = [treasury] as unknown as Parameters<FlashPerpetualsClient["sendAndConfirmErTransaction"]>[1];

    const basket = await client.erAccounts!.fetchBasket(owner).catch(() => null);
    const already = basket?.getPosition(mkt.marketAccount);
    if (already) {
        console.log("position already open — skipping to close");
    } else {
        const collateralLamports = new BN(Math.round(bal * 0.5 * LAMPORTS_PER_SOL));
        const quote = await client.views.getOpenPositionQuoteEr(pool, {
            market: mkt.marketAccount, targetSymbol: "SOL", collateralSymbol: lockSymbol,
            receivingSymbol: "SOL", amountIn: collateralLamports, leverage: new BN(20_000),
            owner,
        });
        const px = (p: { price: BN; exponent: BN }) => Number(p.price.toString()) * 10 ** Number(p.exponent.toString());
        console.log("quote — entry:", px(quote.entryPrice), "sizeUsd:", Number(quote.sizeUsd.toString()) / 1e6, "fee:", Number(quote.totalFeeUsd.toString()) / 1e6);

        const oracle = await fetchOracle();
        const price = client.getPriceAfterSlippage(true, new BN(100), { price: oracle.price, exponent: new BN(oracle.expo) }, Side.Long);
        const { instructions } = await client.openPosition(
            "SOL", lockSymbol, "SOL", Side.Long, pool, price,
            collateralLamports, quote.sizeAmount,
            ...referralTail,
        );
        const res = await client.sendAndConfirmErTransaction(instructions, erSigners);
        console.log("OPEN FILLED:", JSON.stringify(res));
    }

    const basket2 = await client.erAccounts!.fetchBasket(owner);
    const pos = basket2.getPosition(mkt.marketAccount);
    if (!pos) throw new Error("no position after open");
    console.log("position on ER — sizeUsd:", Number(pos.position.sizeUsd.toString()) / 1e6, "collateralUsd:", Number(pos.position.collateralUsd.toString()) / 1e6);

    // ── 4. close it ──
    const lockCustody = pool.custodies.find((c) => c.custodyAccount.equals(mkt.collateralCustody))!;
    const oracle2 = await fetchOracle();
    const closePrice = client.getPriceAfterSlippage(false, new BN(100), { price: oracle2.price, exponent: new BN(oracle2.expo) }, Side.Long);
    const { instructions: closeIxs } = await client.closePosition(
        "SOL", lockCustody.symbol, Side.Long, pool, closePrice, "SOL",
        ...referralTail,
    );
    const closeRes = await client.sendAndConfirmErTransaction(closeIxs, erSigners);
    console.log("CLOSE FILLED:", JSON.stringify(closeRes));

    const after = await ledgerSol();
    console.log("ledger SOL after round-trip:", after);

    // ── 5. withdraw back to the wallet ──
    const escrowPayer = Keypair.generate();
    // Escrow receipt rent (~0.01+) comes back to this payer when the keeper
    // settles; fund generously so the payer also stays rent-exempt itself.
    const fundIx = SystemProgram.transfer({ fromPubkey: owner, toPubkey: escrowPayer.publicKey, lamports: 0.03 * LAMPORTS_PER_SOL });
    const wsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, owner, true);
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(owner, wsolAta, owner, NATIVE_MINT);
    const wr = await client.withdrawalWithAction(
        NATIVE_MINT, wsolAta, new BN(Math.round(after * LAMPORTS_PER_SOL)), escrowPayer.publicKey,
    );
    const wtx = new Transaction().add(fundIx, ataIx, ...wr.instructions);
    wtx.feePayer = owner;
    wtx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    wtx.partialSign(treasury, escrowPayer);
    const wsig = await connection.sendRawTransaction(wtx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(wsig, "confirmed");
    console.log("withdraw queued:", wsig);

    // Keeper settles the escrow; poll the WSOL ATA for up to ~2 minutes.
    for (let i = 0; i < 24; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const b = await connection.getTokenAccountBalance(wsolAta).catch(() => null);
        const ui = b?.value.uiAmount ?? 0;
        if (ui > 0) {
            console.log(`WITHDRAW SETTLED: ${ui} WSOL back in the wallet (unwrap via any wallet UI)`);
            console.log("\nLIVE FILL TEST PASSED");
            return;
        }
    }
    console.log("withdraw queued but not yet settled (keeper-driven) — check the WSOL ATA later:", wsolAta.toBase58());
    console.log("\nLIVE FILL TEST PASSED (open + close filled; withdraw pending settle)");
}

main().then(() => process.exit(0)).catch((e) => {
    console.error("LIVE FILL FAILED:", e?.message ?? e);
    process.exit(1);
});
