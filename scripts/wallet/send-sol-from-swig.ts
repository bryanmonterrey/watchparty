// Send SOL from a user's Swig wallet to an address they name — the same
// FROST-root-signed path the app uses (frostCommit purpose=tx), run from a
// workstation. Keeps the wallet address's rent-exempt minimum so the wallet
// stays usable.
//
//   bun scripts/wallet/send-sol-from-swig.ts <username> <destination> [--dry-run]
//
// Reads PRODUCTION .env.production. Treasury pays the fee. Never prints a key
// or share. Refuses to send unless the simulation shows exactly
// wallet -> destination for the stated amount.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.production", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i <= 0 || line.trimStart().startsWith("#")) continue;
    const k = line.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = line.slice(i + 1).replace(/^["']|["']$/g, "").trim();
}

const TREASURY = "C9kxyKYYsFtrBBVCd77o1xKEePxXSq5ck8YvomEZL3bE";

async function main() {
    const [username, destStr] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
    if (!username || !destStr) throw new Error("usage: bun scripts/wallet/send-sol-from-swig.ts <username> <destination> [--dry-run]");

    const { default: postgres } = await import("postgres");
    const { Connection, Keypair, PublicKey, SystemProgram, Transaction } = await import("@solana/web3.js");
    const { fetchSwig, getSwigWalletAddress, getSignInstructions } = await import("@swig-wallet/classic");
    const { deriveWalletKey } = await import("@/lib/wallet/key-derivation");
    const { clientCommit, clientSignShare } = await import("@/lib/frost/frost-client");
    const { serverCommit, serverSignAndAggregate, extractMessageBytes, insertFrostSignature } = await import("@/lib/frost/frost-server");

    const dest = new PublicKey(destStr);
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
    try {
        const [w] = await sql`
            select ew.user_id, ew.passkey_credential_id, ew.salt, ew.key_version,
                   ew.frost_server_share, ew.frost_server_share_iv,
                   ew.frost_client_share_encrypted, ew.frost_client_share_iv,
                   ew.frost_public_key, ew.frost_public_info, ew.swig_address
            from encrypted_wallets ew join "user" u on u.id = ew.user_id
            where u.username = ${username}`;
        if (!w?.swig_address || !w.frost_server_share || !w.frost_client_share_encrypted) throw new Error(`${username} has no FROST/Swig wallet`);

        const subtle = globalThis.crypto.subtle;
        const key = await deriveWalletKey(w.passkey_credential_id || `social-${w.user_id}`, Buffer.from(w.salt, "base64"), w.key_version ?? 1, ["decrypt"]);
        const dec = async (ct: string, iv: string) => JSON.parse(Buffer.from(
            await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64") }, key, Buffer.from(ct, "base64")),
        ).toString());
        const serverShare = await dec(w.frost_server_share, w.frost_server_share_iv);
        const clientShare = await dec(w.frost_client_share_encrypted, w.frost_client_share_iv);
        const publicInfo = JSON.parse(w.frost_public_info);

        const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        const treasury = Keypair.fromSecretKey(Buffer.from(process.env.SWIG_TREASURY_PRIVATE_KEY!, "base64"));
        if (treasury.publicKey.toBase58() !== TREASURY) throw new Error("unexpected treasury key");

        const swig = await fetchSwig(conn, new PublicKey(w.swig_address));
        const frostPk = new PublicKey(Buffer.from(w.frost_public_key, "base64"));
        const root = swig.findRolesByEd25519SignerPk(frostPk).find((r) => !r.isSessionBased());
        if (!root) throw new Error("FROST root role not found on Swig");
        const wallet = await getSwigWalletAddress(swig);
        if (wallet.equals(dest)) throw new Error("destination is the wallet itself");

        const balance = await conn.getBalance(wallet);
        const keep = await conn.getMinimumBalanceForRentExemption(0);
        const amount = balance - keep;
        if (amount <= 0) throw new Error(`nothing to send (balance ${balance / 1e9} SOL)`);

        const transfer = SystemProgram.transfer({ fromPubkey: wallet, toPubkey: dest, lamports: amount });
        const signIxs = await getSignInstructions(swig, root.id, [transfer], false, { payer: treasury.publicKey });
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
        const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...signIxs);
        tx.partialSign(treasury);
        const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");

        const c1 = await clientCommit(clientShare);
        const s1 = serverCommit(serverShare);
        const msg = await extractMessageBytes(txBase64);
        const clientSig = await clientSignShare(clientShare, publicInfo, c1.nonces, c1.clientCommitment, s1.serverCommitment, msg);
        const frostSig = serverSignAndAggregate(serverShare, publicInfo, s1.nonces, c1.clientCommitment, s1.serverCommitment, clientSig, msg);
        const signed = Transaction.from(Buffer.from(await insertFrostSignature(txBase64, w.frost_public_key, frostSig), "base64"));
        if (!signed.verifySignatures()) throw new Error("signature verification failed — NOT sending");

        const destBefore = await conn.getBalance(dest);
        const sim = await conn.simulateTransaction(signed, undefined, [wallet, dest]);
        if (sim.value.err) throw new Error(`simulation failed — NOT sending: ${JSON.stringify(sim.value.err)}`);
        const [simWallet, simDest] = sim.value.accounts!;
        console.log(`from   : ${wallet.toBase58()}  ${balance / 1e9} -> ${simWallet!.lamports / 1e9} SOL`);
        console.log(`to     : ${dest.toBase58()}  ${destBefore / 1e9} -> ${simDest!.lamports / 1e9} SOL`);
        console.log(`amount : ${amount / 1e9} SOL`);
        if (simDest!.lamports - destBefore !== amount) throw new Error("simulated amount mismatch — NOT sending");

        if (process.argv.includes("--dry-run")) { console.log("dry run — simulation passed, NOT sending"); return; }
        const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: false });
        await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        console.log(`sent   : ${sig}`);
    } finally {
        await sql.end();
    }
}

main().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; });
