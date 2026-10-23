// Move SOL stranded on a user's Swig ACCOUNT into that same wallet's spendable
// address (Swig TransferAssetsV1). Both ends belong to the user's wallet;
// nothing goes to any other address.
//
// Why it exists: on a v2 Swig the balance lives at getSwigWalletAddress(), so
// lamports sent to the Swig account itself (e.g. before the Swig existed — the
// owner's wallet, 2026-10-04..22) are invisible to balances and sends.
//
//   bun scripts/wallet/recover-stranded-swig.ts <username> [--dry-run]
//   --dry-run: everything through the simulation, then stops (nothing sent).
//
// Signs exactly like the app's frostCommit/frostSign "management" path:
// server-built tx, FROST 2-of-2 root signature (both shares decrypted here the
// same way frostSetup restores a device), treasury as fee payer. Reads
// PRODUCTION .env.production. Never prints a key or share. Refuses to send
// unless the simulation shows ONLY the expected account -> wallet move.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.production", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trimStart().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).replace(/^["']|["']$/g, "").trim();
}

const SWIG_PROGRAM = "swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB";
const TREASURY = "C9kxyKYYsFtrBBVCd77o1xKEePxXSq5ck8YvomEZL3bE";

async function main() {
    const username = process.argv[2];
    if (!username) throw new Error("usage: bun scripts/wallet/recover-stranded-swig.ts <username>");

    const { default: postgres } = await import("postgres");
    const { Connection, Keypair, PublicKey, Transaction } = await import("@solana/web3.js");
    const { fetchSwig, getSwigWalletAddress, getTransferAssetsInstructions } = await import("@swig-wallet/classic");
    const { deriveWalletKey } = await import("@/lib/wallet/key-derivation");
    const { clientCommit, clientSignShare } = await import("@/lib/frost/frost-client");
    const { serverCommit, serverSignAndAggregate, extractMessageBytes, insertFrostSignature } = await import("@/lib/frost/frost-server");

    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
        const [w] = await sql`
            select ew.user_id, ew.passkey_credential_id, ew.salt, ew.key_version,
                   ew.frost_server_share, ew.frost_server_share_iv,
                   ew.frost_client_share_encrypted, ew.frost_client_share_iv,
                   ew.frost_public_key, ew.frost_public_info, ew.swig_address
            from encrypted_wallets ew join "user" u on u.id = ew.user_id
            where u.username = ${username}`;
        if (!w?.swig_address || !w.frost_server_share || !w.frost_client_share_encrypted) {
            throw new Error(`${username} has no FROST/Swig wallet with a recoverable client share`);
        }

        // ── Decrypt both FROST shares (same derivation as frostSetup/frostCommit) ──
        const subtle = globalThis.crypto.subtle;
        const key = await deriveWalletKey(
            w.passkey_credential_id || `social-${w.user_id}`,
            Buffer.from(w.salt, "base64"),
            w.key_version ?? 1,
            ["decrypt"],
        );
        const dec = async (ct: string, iv: string) => JSON.parse(Buffer.from(
            await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, key, Buffer.from(ct, "base64")),
        ).toString());
        const serverShare = await dec(w.frost_server_share, w.frost_server_share_iv);
        const clientShare = await dec(w.frost_client_share_encrypted, w.frost_client_share_iv);
        const publicInfo = JSON.parse(w.frost_public_info);

        // ── Build the TransferAssets tx ──
        const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        const treasury = Keypair.fromSecretKey(Buffer.from(process.env.SWIG_TREASURY_PRIVATE_KEY!, "base64"));
        if (treasury.publicKey.toBase58() !== TREASURY) throw new Error("unexpected treasury key");
        const swigPk = new PublicKey(w.swig_address);
        const info = await conn.getAccountInfo(swigPk);
        if (info?.owner.toBase58() !== SWIG_PROGRAM) throw new Error("Swig account does not exist on-chain");
        const rent = await conn.getMinimumBalanceForRentExemption(info.data.length);
        const stranded = info.lamports - rent;
        if (stranded < 1_000_000) throw new Error(`nothing meaningful to recover (${stranded / 1e9} SOL)`);

        const swig = await fetchSwig(conn, swigPk);
        const frostPk = new PublicKey(Buffer.from(w.frost_public_key, "base64"));
        const root = swig.findRolesByEd25519SignerPk(frostPk).find((r) => !r.isSessionBased());
        if (!root) throw new Error("FROST root role not found on Swig");
        const wallet = await getSwigWalletAddress(swig);

        const ixs = await getTransferAssetsInstructions(swig, root.id, { payer: treasury.publicKey });
        if (ixs.length !== 1 || ixs[0].programId.toBase58() !== SWIG_PROGRAM) throw new Error("unexpected instruction set");
        const allowed = new Set([swigPk.toBase58(), wallet.toBase58(), treasury.publicKey.toBase58(), frostPk.toBase58(), "11111111111111111111111111111111"]);
        for (const k of ixs[0].keys) if (!allowed.has(k.pubkey.toBase58())) throw new Error(`unexpected account ${k.pubkey.toBase58()}`);

        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...ixs);
        tx.partialSign(treasury);
        const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");

        // ── FROST 2-of-2 root signature ──
        const c1 = await clientCommit(clientShare);
        const s1 = serverCommit(serverShare);
        const msg = await extractMessageBytes(txBase64);
        const clientSig = await clientSignShare(clientShare, publicInfo, c1.nonces, c1.clientCommitment, s1.serverCommitment, msg);
        const frostSig = serverSignAndAggregate(serverShare, publicInfo, s1.nonces, c1.clientCommitment, s1.serverCommitment, clientSig, msg);
        const signed = Transaction.from(Buffer.from(await insertFrostSignature(txBase64, w.frost_public_key, frostSig), "base64"));
        if (!signed.verifySignatures()) throw new Error("signature verification failed — NOT sending");

        // ── Simulate: the only movement allowed is account -> wallet ──
        const walletBefore = await conn.getBalance(wallet);
        const sim = await conn.simulateTransaction(signed, undefined, [swigPk, wallet]);
        if (sim.value.err) throw new Error(`simulation failed — NOT sending: ${JSON.stringify(sim.value.err)}`);
        const [simSwig, simWallet] = sim.value.accounts!;
        const gained = simWallet!.lamports - walletBefore;
        console.log(`swig account : ${info.lamports / 1e9} -> ${simSwig!.lamports / 1e9} SOL`);
        console.log(`wallet       : ${walletBefore / 1e9} -> ${simWallet!.lamports / 1e9} SOL  (${wallet.toBase58()})`);
        if (gained < stranded * 0.99) throw new Error("simulated gain doesn't match the stranded amount — NOT sending");

        if (process.argv.includes("--dry-run")) { console.log("dry run — simulation passed, NOT sending"); return; }
        const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight: (await conn.getLatestBlockhash()).lastValidBlockHeight }, "confirmed");
        console.log(`sent         : ${sig}`);
        console.log(`wallet now   : ${(await conn.getBalance(wallet)) / 1e9} SOL — spendable from the app`);
    } finally {
        await sql.end();
    }
}

main().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; });
