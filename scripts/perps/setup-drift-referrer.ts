// One-time: make the treasury a Drift REFERRER so watchparty earns 35% of
// referred users' taker fees (referred users get 5% off). Idempotent.
//
//   bun run scripts/perps/setup-drift-referrer.ts
//
// Needs TREASURY_PRIVATE_KEY (base58/base64/json array — same parsing as the
// premium collector) + a mainnet RPC. Creates, if missing:
//   1. the treasury's Drift user account (+ user stats)
//   2. the on-chain referrer name "watchparty"
// The perps UI then attaches this account as referrerInfo on every new
// user's first-deposit account creation (lib/perps/drift.ts referrerInfo()).
import { Connection, Keypair } from "@solana/web3.js";
import {
    DriftClient,
    Wallet,
    getUserAccountPublicKey,
    getReferrerNamePublicKeySync,
    encodeName,
} from "@drift-labs/sdk";

// The SDK nests its own @solana/web3.js — same runtime shape, different type
// identity. Cast at the constructor boundary (policy of lib/perps/drift.ts).
type SdkConnection = ConstructorParameters<typeof DriftClient>[0]["connection"];
type SdkKeypair = ConstructorParameters<typeof Wallet>[0];

const REFERRER_NAME = "watchparty";

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
if (!rpc) throw new Error("No RPC url in env");
const secret = process.env.TREASURY_PRIVATE_KEY;
if (!secret) throw new Error("TREASURY_PRIVATE_KEY not set");

const keypair = parseKeypair(secret);
console.log("treasury:", keypair.publicKey.toBase58());

const connection = new Connection(rpc, "confirmed");
const client = new DriftClient({
    connection: connection as unknown as SdkConnection,
    wallet: new Wallet(keypair as unknown as SdkKeypair),
    env: "mainnet-beta",
    accountSubscription: { type: "websocket" },
});
await client.subscribe();

// 1. Drift user account
const userPk = await getUserAccountPublicKey(client.program.programId, keypair.publicKey, 0);
const hasUser = !!(await connection.getAccountInfo(userPk));
if (hasUser) {
    console.log("✓ drift user account exists:", userPk.toBase58());
} else {
    const [sig] = await client.initializeUserAccount(0, REFERRER_NAME);
    console.log("✓ created drift user account:", userPk.toBase58(), "sig:", sig);
}

// 2. Referrer name PDA ("watchparty" → this account)
const namePk = getReferrerNamePublicKeySync(client.program.programId, encodeName(REFERRER_NAME));
const hasName = !!(await connection.getAccountInfo(namePk));
if (hasName) {
    console.log(`✓ referrer name "${REFERRER_NAME}" already registered:`, namePk.toBase58());
} else {
    const sig = await client.initializeReferrerName(REFERRER_NAME);
    console.log(`✓ registered referrer name "${REFERRER_NAME}":`, namePk.toBase58(), "sig:", sig);
}

console.log("\nDone. Users who create their Drift account through watchparty");
console.log("now carry the treasury as referrer (35% of their taker fees).");
console.log("Referral dust accrues to the treasury's Drift account — check");
console.log(`https://app.drift.trade with the treasury wallet occasionally.`);
await client.unsubscribe();
process.exit(0);
