#!/usr/bin/env node
/**
 * Devnet proof for the Swig session-authority fix.
 *
 * Establishes two facts on a real chain, with throwaway keys and free devnet
 * SOL — no mainnet, no user wallet, no real funds anywhere:
 *
 *   1. THE BUG — a Swig root created with `createEd25519AuthorityInfo`
 *      (AuthorityType.Ed25519) cannot have a session created on it.
 *      `getCreateSessionInstructions` throws "Role is not a session-based".
 *      This is why `ensureSession` always returned null and perps'
 *      `submitCosigned` hard-threw for Swig users.
 *
 *   2. THE FIX — adding a SECOND authority carrying the same pubkey, declared
 *      via `createEd25519SessionAuthorityInfo`, makes session creation succeed
 *      without touching the root.
 *
 * It also checks the thing that actually made this change risky: that after
 * adding the second authority, the root is still findable and still distinct,
 * so the `.find(r => !r.isSessionBased())` lookups in swig-server.ts resolve
 * the way the code assumes.
 *
 *   node scripts/swig/verify-session-authority.mjs
 *   node scripts/swig/verify-session-authority.mjs --rpc https://devnet.helius-rpc.com/?api-key=...
 */

import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
// CJS under plain node — named ESM imports don't resolve, so destructure the
// default. (Next/bun handle this transparently; this script doesn't go through
// either.)
import swigPkg from "@swig-wallet/classic";
const {
    Actions,
    createEd25519AuthorityInfo,
    createEd25519SessionAuthorityInfo,
    fetchSwig,
    findSwigPda,
    getAddAuthorityInstructions,
    getCreateSessionInstructions,
    getCreateSwigInstruction,
} = swigPkg;

const argRpc = process.argv.indexOf("--rpc");
const RPC = argRpc > -1 ? process.argv[argRpc + 1] : "https://api.devnet.solana.com";

if (/mainnet/i.test(RPC)) {
    console.error("refusing to run against mainnet — this script creates accounts");
    process.exit(1);
}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

async function send(conn, ixs, signers) {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: signers[0].publicKey }).add(...ixs);
    tx.sign(...signers);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
}

const conn = new Connection(RPC, "confirmed");
console.log(`\nrpc: ${RPC.replace(/api-key=.*/, "api-key=***")}\n`);

// ── payer ────────────────────────────────────────────────────────────────────
// Prefers the local solana CLI devnet keypair (devnet SOL is worthless, and
// the public faucets rate-limit hard). Falls back to an airdropped throwaway.
console.log("1. resolving a payer");
let payer;
const cliKeypair = process.env.HOME + "/.config/solana/id.json";
try {
    const { readFileSync } = await import("node:fs");
    payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cliKeypair, "utf8"))));
    const bal = await conn.getBalance(payer.publicKey);
    if (bal < 0.02 * LAMPORTS_PER_SOL) throw new Error(`only ${bal / LAMPORTS_PER_SOL} SOL`);
    ok(`using solana CLI keypair ${payer.publicKey.toBase58().slice(0, 8)}… (${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
} catch (e) {
    console.log(`  (cli keypair unusable: ${e.message}) — trying an airdrop`);
    payer = Keypair.generate();
    try {
        const sig = await conn.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        const bh = await conn.getLatestBlockhash("confirmed");
        await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
        ok(`airdropped 2 SOL to ${payer.publicKey.toBase58().slice(0, 8)}…`);
    } catch (err) {
        bad(`airdrop failed: ${err.message}`);
        console.log("\n  fund a devnet keypair and retry:  solana airdrop 1 --url devnet\n");
        process.exit(1);
    }
}

// `authority` stands in for the FROST group key — same ed25519 shape, and the
// Swig program cannot tell the difference. Using a plain keypair means this
// script needs no FROST plumbing to prove the authority-type behaviour.
const authority = Keypair.generate();

// ── create a Swig exactly as createSwigAccount() does ────────────────────────
console.log("\n2. creating a Swig with a NON-session root (as createSwigAccount does today)");
const id = crypto.getRandomValues(new Uint8Array(32));
const swigAddress = findSwigPda(id);
await send(conn, [
    await getCreateSwigInstruction({
        payer: payer.publicKey,
        id,
        actions: Actions.set().all().get(),
        authorityInfo: createEd25519AuthorityInfo(authority.publicKey),
    }),
], [payer]);
ok(`swig created at ${swigAddress.toBase58().slice(0, 8)}…`);

let swig = await fetchSwig(conn, new PublicKey(swigAddress));
const rootRole = swig.findRolesByEd25519SignerPk(authority.publicKey)[0];
ok(`root role id ${rootRole.id}, isSessionBased() = ${rootRole.isSessionBased()}`);

// ── FACT 1: sessions are impossible against that root ────────────────────────
console.log("\n3. THE BUG — attempting a session on the root");
const sessionKp = Keypair.generate();
let threw = null;
try {
    await getCreateSessionInstructions(swig, rootRole.id, sessionKp.publicKey, BigInt(1_512_000), {
        payer: payer.publicKey,
    });
} catch (e) {
    threw = e.message;
}
if (threw) ok(`threw as predicted: "${threw}"`);
else bad("did NOT throw — the premise of the fix is wrong, stop and re-read");

// ── FACT 2: adding a session-capable authority fixes it ──────────────────────
console.log("\n4. THE FIX — adding an Ed25519Session authority for the same pubkey");
await send(conn, await getAddAuthorityInstructions(
    swig,
    rootRole.id,
    createEd25519SessionAuthorityInfo(authority.publicKey, BigInt(1_512_000)),
    Actions.set().all().get(),
    { payer: payer.publicKey },
), [payer, authority]);
ok("add-authority confirmed on chain");

swig = await fetchSwig(conn, new PublicKey(swigAddress));
// findRolesByEd25519SignerPk matches on authority.signer — and for a SESSION
// authority `signer` is the sessionKey (all zeros until a session exists), NOT
// the authority pubkey. findRolesByAuthorityAddress matches `address`, which
// is the authority pubkey on both types.
const bySigner = swig.findRolesByEd25519SignerPk(authority.publicKey);
const roles = swig.findRolesByAuthorityAddress(authority.publicKey.toBytes());
ok(`byAuthorityAddress -> ${roles.length} role(s)   (bySignerPk -> ${bySigner.length}, which is why the first attempt failed)`);

// Diagnostic: what is actually ON the account, regardless of what the
// convenience lookup matches.
console.log(`  \x1b[2m— all ${swig.roles.length} role(s) on the swig —\x1b[0m`);
for (const r of swig.roles) {
    const a = r.authority;
    const signerB58 = a.signer ? new PublicKey(Uint8Array.from(a.signer)).toBase58().slice(0, 8) + "…" : "(none)";
    const sessionKey = a.sessionKey ? new PublicKey(a.sessionKey.toBytes?.() ?? a.sessionKey).toBase58().slice(0, 8) + "…" : "(none)";
    console.log(`  \x1b[2m  id=${r.id} type=${a.constructor.name} session=${r.isSessionBased()} signer=${signerB58} sessionKey=${sessionKey}\x1b[0m`);
}
console.log(`  \x1b[2m  authority pubkey we added: ${authority.publicKey.toBase58().slice(0, 8)}…\x1b[0m`);

// The risk this change introduced: [0] became ambiguous. swig-server.ts now
// selects by isSessionBased() everywhere — prove both selectors resolve.
const root2 = roles.find((r) => !r.isSessionBased());
const sessionRole = roles.find((r) => r.isSessionBased());
root2 ? ok(`root still resolvable via .find(!isSessionBased) → id ${root2.id}`)
      : bad("ROOT NOT FOUND — the .find() lookups in swig-server.ts would break");
sessionRole ? ok(`session role resolvable → id ${sessionRole.id}`)
            : bad("session role not found");
if (root2 && sessionRole && root2.id === sessionRole.id) bad("root and session are the SAME role — selectors are not distinguishing");

console.log("\n5. creating a session against the session role");
try {
    await send(conn, await getCreateSessionInstructions(
        swig, sessionRole.id, sessionKp.publicKey, BigInt(1_512_000), { payer: payer.publicKey },
    ), [payer, authority]);
    ok("session created — the fix works end to end");
} catch (e) {
    bad(`session creation failed: ${e.message}`);
}

console.log("");
