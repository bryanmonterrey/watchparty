// Create a user's Swig account from this machine — the same step
// wallet.ensureSwigAccount runs server-side (lib/swig/swig-server.ts
// createSwigAccount), for when the server can't: on 2026-10-22 the plain
// worker hit its 128 MB limit loading the Swig SDK, and the request died.
//
//   node scripts/wallet/create-swig-account.cjs <username>
//
// Reads PRODUCTION .env.production (treasury key + DATABASE_URL). Simulates
// first and refuses to send if the simulation fails. The treasury pays rent
// into the user's own Swig PDA; nothing is transferred to anyone else. On
// success it confirms the account on-chain and sets swig_account_created=true.
const { readFileSync } = require("node:fs");
const { Connection, PublicKey, Transaction, Keypair, sendAndConfirmTransaction } = require("@solana/web3.js");
const { getCreateSwigInstruction, Actions, createEd25519AuthorityInfo, fetchSwig, findSwigPda } = require("@swig-wallet/classic");
const postgres = require("postgres");

const SWIG_PROGRAM = "swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB";

(async () => {
    const username = process.argv[2];
    if (!username) throw new Error("usage: node scripts/wallet/create-swig-account.cjs <username>");

    const env = readFileSync(".env.production", "utf8").split("\n");
    const get = (k) => {
        const l = env.find((x) => x.startsWith(`${k}=`));
        return l ? l.slice(k.length + 1).replace(/^["']|["']$/g, "").trim() : undefined;
    };
    const sql = postgres(get("DATABASE_URL"), { max: 1, prepare: false });
    try {
        const [w] = await sql`
            select ew.user_id, ew.swig_id, ew.swig_address, ew.frost_public_key, ew.swig_account_created
            from encrypted_wallets ew join "user" u on u.id = ew.user_id
            where u.username = ${username}`;
        if (!w?.swig_id || !w.frost_public_key) throw new Error(`no embedded Swig wallet for ${username}`);

        const id = Buffer.from(w.swig_id, "hex");
        const pdaRaw = findSwigPda(id);
        const pda = new PublicKey(pdaRaw.toBase58 ? pdaRaw.toBase58() : String(pdaRaw));
        if (pda.toBase58() !== w.swig_address) throw new Error(`PDA ${pda.toBase58()} != stored ${w.swig_address}`);

        const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
        const existing = await conn.getAccountInfo(pda);
        if (existing?.owner.toBase58() === SWIG_PROGRAM) {
            console.log("Swig account already exists — only fixing the flag.");
        } else {
            const treasury = Keypair.fromSecretKey(Buffer.from(get("SWIG_TREASURY_PRIVATE_KEY"), "base64"));
            const ix = await getCreateSwigInstruction({
                payer: treasury.publicKey,
                id,
                actions: Actions.set().all().get(),
                authorityInfo: createEd25519AuthorityInfo(new PublicKey(Buffer.from(w.frost_public_key, "base64"))),
            });
            const tx = new Transaction().add(ix);
            tx.feePayer = treasury.publicKey;
            tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

            console.log(`swig PDA : ${pda.toBase58()} (holds ${(existing?.lamports ?? 0) / 1e9} SOL)`);
            console.log(`payer    : ${treasury.publicKey.toBase58()}`);
            const sim = await conn.simulateTransaction(tx);
            if (sim.value.err) throw new Error(`simulation failed — NOT sending: ${JSON.stringify(sim.value.err)}`);
            console.log("simulation ok — sending");

            const before = await conn.getBalance(treasury.publicKey);
            const sig = await sendAndConfirmTransaction(conn, tx, [treasury], { commitment: "confirmed" });
            const after = await conn.getBalance(treasury.publicKey);
            console.log(`sent     : ${sig}`);
            console.log(`treasury spent ${(before - after) / 1e9} SOL`);
        }

        const swig = await fetchSwig(conn, pda);
        const now = await conn.getAccountInfo(pda);
        console.log(`on-chain : owner ${now.owner.toBase58()}, ${now.lamports / 1e9} SOL, ${swig.roles.length} role(s)`);

        await sql`update encrypted_wallets set swig_account_created = true, updated_at = now() where user_id = ${w.user_id}`;
        console.log("flag     : swig_account_created = true");
    } finally {
        await sql.end();
    }
})().catch((e) => { console.error("ERR", e.message); process.exitCode = 1; });
