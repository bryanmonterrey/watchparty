// One-time: make the treasury a Flash Trade REFERRER so watchparty earns a
// rebate on referred users' trading fees. Idempotent.
//
//   bun scripts/perps/setup-flash-referrer.ts            # create (signs + sends)
//   bun scripts/perps/setup-flash-referrer.ts --dry-run  # simulate only
//
// Flash v2 referral model (rebate schedule read live from the perpetuals
// config): rebate = % of the referred trader's fees, tiered by the
// referrer's FAF stake level — 2.5% at the base tier up to 10%. Staking FAF
// later upgrades the rate; nothing here needs to change.
//
// Creates, if missing, the treasury's `token_stake` via
// init_delegate_token_stake: zero token movement, account is born DELEGATED
// to the ER (trading ixs write rebates to it there). Traders' Referral
// accounts point at it; lib/perps/flash.ts attaches both to every trade.
//
// Needs TREASURY_PRIVATE_KEY (base58/base64/json array) + a mainnet RPC.
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import {
    FlashPerpetualsClient,
    PROGRAM_ID,
    findTokenStakeAddress,
    findReferralAddress,
} from "@flash_trade/flash-sdk-v2";
import { buildInitDelegateTokenStake } from "@flash_trade/flash-sdk-v2/dist/instructions/stake/initDelegateTokenStake";

const ER_ENDPOINT = process.env.NEXT_PUBLIC_FLASH_ER_RPC ?? "https://flash.magicblock.xyz";

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
    const dryRun = process.argv.includes("--dry-run");
    const connection = new Connection(rpc!, "confirmed");
    const treasury = parseKeypair(process.env.TREASURY_PRIVATE_KEY!);
    console.log("treasury:", treasury.publicKey.toBase58());

    const wallet = {
        publicKey: treasury.publicKey,
        signTransaction: async (tx: Transaction) => { tx.partialSign(treasury); return tx; },
        signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(treasury)); return txs; },
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
        {},
        ER_ENDPOINT,
    );

    // Live rebate schedule, so the run log documents what we earn.
    try {
        const cfg = await client.accounts.fetchPerpetuals();
        const pct = (v: BN) => `${(Number(v.toString()) / 1e9) * 100}%`;
        console.log("referral rebate by stake level:", (cfg.referralRebate as BN[]).map(pct).join(" "));
        console.log("default rebate:", pct(cfg.defaultRebate as BN));
    } catch { /* cosmetic */ }

    const [tokenStake] = findTokenStakeAddress(treasury.publicKey);
    console.log("token_stake PDA:", tokenStake.toBase58());

    const existing = await connection.getAccountInfo(new PublicKey(tokenStake.toBase58()));
    if (existing) {
        console.log(`TokenStake already exists (owner program ${existing.owner.toBase58()}) — nothing to send.`);
    } else {
        const { instructions } = await buildInitDelegateTokenStake(client.program, {
            owner: treasury.publicKey,
            payer: treasury.publicKey,
        });
        const tx = new Transaction();
        for (const ix of instructions) tx.add(ix);
        tx.feePayer = treasury.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        const sim = await connection.simulateTransaction(tx);
        if (sim.value.err) {
            console.error("simulation failed:", JSON.stringify(sim.value.err));
            console.error(sim.value.logs?.slice(-8).join("\n"));
            throw new Error("init_delegate_token_stake rejected");
        }
        console.log("simulation ok");
        if (dryRun) {
            console.log("dry run — not sending.");
            return;
        }
        tx.partialSign(treasury);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        await connection.confirmTransaction(sig, "confirmed");
        console.log("created + delegated TokenStake:", sig);
    }

    // Prove a trader-side create_referral will work against it (simulation
    // only — a throwaway "trader" that never pays).
    // The treasury is the funded fee payer (a 0-SOL payer simulates as
    // AccountNotFound before the program even runs); the trader only seeds
    // the referral PDA. Simulation skips signature checks.
    const trader = Keypair.generate();
    const [referralPda] = findReferralAddress(trader.publicKey);
    const ix = await client.program.methods
        .createReferral({})
        .accountsPartial({
            owner: trader.publicKey,
            feePayer: treasury.publicKey,
            tokenStakeAccount: tokenStake,
            referralAccount: referralPda,
        })
        .instruction();
    const probe = new Transaction().add(ix);
    probe.feePayer = treasury.publicKey;
    probe.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const sim2 = await connection.simulateTransaction(probe);
    if (sim2.value.err) {
        console.error("create_referral probe FAILED:", JSON.stringify(sim2.value.err));
        console.error((sim2.value.logs ?? []).slice(-8).join("\n"));
        throw new Error("create_referral does not accept the delegated token stake");
    }
    console.log("create_referral probe: OK");

    console.log("\nDone. lib/perps/flash.ts picks the referrer up automatically (no env change).");
}

main().then(() => process.exit(0)).catch((e) => {
    console.error("FAILED:", e?.message ?? e);
    process.exit(1);
});
