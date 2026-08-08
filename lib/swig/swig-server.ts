// Server-only — never import this from client components.
// This file uses @swig-wallet/classic directly against the Solana RPC (Helius).
// It does NOT use Swig's hosted API services, so there are zero UserOp limits
// regardless of transaction volume — the only ceiling is Solana itself.
import {
    Actions,
    createEd25519AuthorityInfo,
    createEd25519SessionAuthorityInfo,
    fetchSwig,
    findSwigPda,
    getAddAuthorityInstructions,
    getCreateSwigInstruction,
    getCreateSessionInstructions,
    getRemoveAuthorityInstructions,
    getSignInstructions,
    getSwigWalletAddress,
} from '@swig-wallet/classic';
import { sha256 } from '@noble/hashes/sha2.js';
import {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    Transaction,
} from '@solana/web3.js';
import { createServerConnection } from '@/lib/solana/server-connection';

// Lazily created so importing this module (e.g. during `next build` page-data
// collection) never constructs a Connection when the RPC env var is absent.
let _rpc: Connection | null = null;
function getRpc(): Connection {
    if (!_rpc) {
        const url = process.env.HELIUS_RPC_URL ?? process.env.NEXT_PUBLIC_HELIUS_RPC_URL;
        if (!url) throw new Error("HELIUS_RPC_URL is not set");
        _rpc = createServerConnection(url);
    }
    return _rpc;
}

async function sendWithRetry(
    tx: Transaction,
    signers: Keypair[],
    maxAttempts = 3,
): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { blockhash, lastValidBlockHeight } = await getRpc().getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.sign(...signers);
        try {
            const sig = await getRpc().sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
                maxRetries: 0,
            });
            await getRpc().confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
            return sig;
        } catch (err: any) {
            lastErr = err;
            const msg: string = err?.message ?? '';
            if (msg.includes('block height exceeded') || msg.includes('Blockhash not found')) {
                continue;
            }
            throw err;
        }
    }
    throw lastErr;
}

function getTreasury(): Keypair {
    const key = process.env.SWIG_TREASURY_PRIVATE_KEY;
    if (!key) throw new Error('SWIG_TREASURY_PRIVATE_KEY is not set — fund a keypair and add it to .env.local');
    return Keypair.fromSecretKey(Buffer.from(key, 'base64'));
}

export interface SwigWalletInfo {
    swigId: string;
    swigAddress: string;
}

/**
 * Pure — computes the Swig PDA address without any RPC call.
 * Call this at signup so the user has a permanent wallet address immediately,
 * even before the on-chain account exists (Solana allows receiving funds at
 * uncreated PDA addresses).
 */
export function computeSwigPda(): SwigWalletInfo {
    const id = crypto.getRandomValues(new Uint8Array(32));
    const swigAccountAddress = findSwigPda(id);
    return {
        swigId: Buffer.from(id).toString('hex'),
        swigAddress: swigAccountAddress.toBase58(),
    };
}

/**
 * Deterministic Swig PDA from the account mnemonic seed.
 *
 * The swig id is one of the two things (with the FROST group key) that used to
 * be random and therefore un-recoverable from the phrase. Deriving it here is
 * what lets a user restore their exact Solana address from their 12 words.
 */
export function computeSwigPdaFromSeed(seed: Uint8Array): SwigWalletInfo {
    const id = sha256(
        concatBytes(new TextEncoder().encode('watchparty/swig-id/v1'), seed)
    );
    const swigAccountAddress = findSwigPda(id);
    return {
        swigId: Buffer.from(id).toString('hex'),
        swigAddress: swigAccountAddress.toBase58(),
    };
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

/**
 * Creates the Swig account on-chain. Treasury pays.
 * Called lazily on first outgoing transaction — NOT at signup.
 */
export async function createSwigAccount(swigId: string, frostGroupPubkeyBase64: string): Promise<void> {
    const treasury = getTreasury();
    const authorityPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    const id = Buffer.from(swigId, 'hex');

    const createIx = await getCreateSwigInstruction({
        payer: treasury.publicKey,
        id,
        actions: Actions.set().all().get(),
        authorityInfo: createEd25519AuthorityInfo(authorityPubkey),
    });

    const tx = new Transaction().add(createIx);
    await sendWithRetry(tx, [treasury]);
}

/** @deprecated Use computeSwigPda + createSwigAccount separately. */
export async function createSwigWallet(frostGroupPubkeyBase64: string): Promise<SwigWalletInfo> {
    const info = computeSwigPda();
    await createSwigAccount(info.swigId, frostGroupPubkeyBase64);
    return info;
}

export interface SwigSessionInfo {
    sessionPrivateKey: string; // base64 64-byte secret key
    sessionPublicKey: string;  // base58 pubkey registered on-chain
    createdAtSlot: number;
    durationSlots: number;
    treasuryPubkey: string;    // base58 — client sets this as fee payer in txs
}

// 7 days at 400ms/slot. Was ~1 year, which isn't a session — it's a second
// root key with a distant expiry, sitting in browser IndexedDB, and
// `clearSwigSession` has no callers so nothing ever revoked it. A week is long
// enough that re-signing is rare and short enough that a stolen device stops
// mattering. Renewal is one FROST round trip.
const SESSION_DURATION_SLOTS = 1_512_000;

// The ceiling the session AUTHORITY permits, set once when the authority is
// added. Individual sessions ask for SESSION_DURATION_SLOTS; this just has to
// be >= that, and can't be lowered later without replacing the authority.
const SESSION_MAX_DURATION_SLOTS = 1_512_000;

/**
 * Add a SESSION-CAPABLE authority for the FROST group key.
 *
 * Why this exists: the Swig root is created with `createEd25519AuthorityInfo`,
 * i.e. `AuthorityType.Ed25519` — which is NOT session-based. `CreateSessionV1`
 * checks `role.isSessionBased()` and throws "Role is not a session-based"
 * before it ever reaches the chain, so `prepareSessionTransaction` against the
 * root could never have worked. It failed silently everywhere (ensureSession
 * swallows, and use-wallet-signing falls through to FROST 2-of-2) except in
 * perps, where `submitCosigned` treats a missing session as fatal.
 *
 * The fix is additive: keep the root exactly as it is — it's what authorises
 * this very transaction, and sessions can't change authorities — and add a
 * SECOND authority carrying the same FROST pubkey, declared `Ed25519Session`.
 * Existing on-chain Swigs don't need recreating.
 *
 * Root-signed via FROST, like the copy-authority grant next to it.
 */
export async function prepareAddSessionAuthorityTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
): Promise<{ txBase64: string }> {
    const treasury = getTreasury();
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));

    // TWO DIFFERENT LOOKUPS, and mixing them up is the whole trap here
    // (verified on devnet — scripts/swig/verify-session-authority.mjs):
    //
    //   findRolesByEd25519SignerPk matches `authority.signer`. On a SESSION
    //   authority `signer` is the sessionKey — all zeros until a session
    //   actually exists — so a session role NEVER comes back from it.
    //   findRolesByAuthorityAddress matches `authority.address`, which is the
    //   authority pubkey on both types.
    //
    // So: signer lookup for the root, address lookup to see the session role.
    const rootRole = swig.findRolesByEd25519SignerPk(frostPubkey).find((r) => !r.isSessionBased());
    if (!rootRole) throw new Error('FROST root role not found on Swig wallet');
    if (swig.findRolesByAuthorityAddress(frostPubkey.toBytes()).some((r) => r.isSessionBased())) {
        throw new Error('Session authority already present');
    }

    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');

    const ixs = await getAddAuthorityInstructions(
        swig,
        rootRole.id,
        createEd25519SessionAuthorityInfo(frostPubkey, BigInt(SESSION_MAX_DURATION_SLOTS)),
        // Same power as the root, minus authority management (which Swig
        // withholds from sessions regardless). This is the user's own wallet
        // acting for the user — the scoping that matters for DELEGATES is the
        // copy executor's tokenRecurringLimit, not this.
        Actions.set().all().get(),
        { payer: treasury.publicKey },
    );

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...ixs);
    tx.partialSign(treasury);

    return { txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}

/** Does this Swig already carry a session-capable authority for the FROST key? */
export async function hasSessionAuthority(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
): Promise<boolean> {
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    // Address lookup, not signer — see prepareAddSessionAuthorityTransaction.
    return swig.findRolesByAuthorityAddress(frostPubkey.toBytes()).some((r) => r.isSessionBased());
}

/**
 * Build a session creation transaction, pre-signed by treasury as fee payer.
 * The FROST root authority signature is added externally via the 2-round
 * FROST protocol before calling submitSessionTransaction.
 */
export async function prepareSessionTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
    durationSlots = SESSION_DURATION_SLOTS
): Promise<{ txBase64: string; sessionKeypairBase64: string; slot: number }> {
    const treasury = getTreasury();
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));

    // findRolesByAuthorityAddress, NOT findRolesByEd25519SignerPk: the latter
    // matches `authority.signer`, and a session authority's signer is its
    // sessionKey (zeros until a session exists), so it never appears there.
    // Devnet-verified — the signer lookup returns 1 role where the address
    // lookup returns 2 (scripts/swig/verify-session-authority.mjs).
    const sessionRole = swig
        .findRolesByAuthorityAddress(frostPubkey.toBytes())
        .find((r) => r.isSessionBased());

    if (!sessionRole) {
        // Caller is expected to run prepareAddSessionAuthorityTransaction
        // first. Recognisable message — use-swig-session matches on it to add
        // the authority and retry rather than surfacing a dead end.
        throw new Error('NO_SESSION_AUTHORITY');
    }

    const sessionKeypair = Keypair.generate();
    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');
    const slot = await getRpc().getSlot('finalized');

    const sessionIxs = await getCreateSessionInstructions(
        swig,
        sessionRole.id,
        sessionKeypair.publicKey,
        BigInt(durationSlots),
        { payer: treasury.publicKey },
    );

    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey })
        .add(...sessionIxs);

    // Treasury pre-signs as fee payer — FROST root authority signature is added next
    tx.partialSign(treasury);

    return {
        txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64'),
        sessionKeypairBase64: Buffer.from(sessionKeypair.secretKey).toString('base64'),
        slot,
    };
}

/**
 * Submit a session creation transaction that already has both the treasury
 * signature (fee payer) and the FROST root authority signature.
 */
export async function submitSessionTransaction(
    txBase64: string,
    sessionKeypairBase64: string,
    slot: number,
): Promise<SwigSessionInfo> {
    const treasury = getTreasury();
    const sessionKeypair = Keypair.fromSecretKey(Buffer.from(sessionKeypairBase64, 'base64'));
    const rawTx = Buffer.from(txBase64, 'base64');

    const sig = await getRpc().sendRawTransaction(rawTx, { skipPreflight: false });
    await getRpc().confirmTransaction(sig, 'confirmed');

    return {
        sessionPrivateKey: Buffer.from(sessionKeypair.secretKey).toString('base64'),
        sessionPublicKey: sessionKeypair.publicKey.toBase58(),
        createdAtSlot: slot,
        durationSlots: SESSION_DURATION_SLOTS,
        treasuryPubkey: treasury.publicKey.toBase58(),
    };
}

/**
 * Build a Swig execute transaction authorized by the FROST root authority.
 * The inner instructions (from the user's raw tx) are wrapped in Swig sign
 * instructions so the FROST group key can authorize them.
 * Treasury pre-signs as fee payer; FROST root authority signature is added next.
 */
export async function prepareSwigExecuteTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
    rawTransactionBase64: string,
): Promise<{ txBase64: string }> {
    const { Transaction, VersionedTransaction, TransactionMessage, ComputeBudgetProgram } = await import('@solana/web3.js');
    const treasury = getTreasury();
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    // Explicitly the non-session role. A signer lookup can't return a session
    // authority anyway (its signer is the zeroed sessionKey), so [0] was never
    // truly ambiguous — but stating the intent means this keeps working if the
    // SDK ever indexes session authorities by their authority pubkey.
    const rootRole = swig.findRolesByEd25519SignerPk(frostPubkey).find((r) => !r.isSessionBased());
    if (!rootRole) throw new Error('FROST root role not found on Swig wallet');

    const txBytes = Buffer.from(rawTransactionBase64, 'base64');
    let innerInstructions;
    try {
        const vTx = VersionedTransaction.deserialize(txBytes);
        innerInstructions = TransactionMessage.decompile(vTx.message).instructions;
    } catch {
        innerInstructions = Transaction.from(txBytes).instructions;
    }

    const userInstructions = innerInstructions.filter(
        ix => !ix.programId.equals(ComputeBudgetProgram.programId)
    );

    const { getRecommendedMicrolamports } = await import('@/lib/solana/priority-fees');
    const microLamports = await getRecommendedMicrolamports([swigAddress]);

    const signIxs = await getSignInstructions(swig, rootRole.id, userInstructions, false, { payer: treasury.publicKey });

    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');
    const tx = new Transaction();
    tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        ...signIxs,
    );
    tx.feePayer = treasury.publicKey;
    tx.recentBlockhash = blockhash;
    tx.partialSign(treasury);

    return { txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}

export async function getSwigSolAddress(swigAddress: string): Promise<string> {
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    const walletAddress = await getSwigWalletAddress(swig);
    return walletAddress.toBase58();
}

const SWIG_PROGRAM_ID = 'swigypWHEksbC64pWKwah1WTeh9JXwx8H1rJHLdbQMB';

/**
 * Returns true if the address holds a valid Swig account (owned by Swig program
 * with non-empty data). Returns false if the account doesn't exist or is
 * system-owned (pre-funded PDA that was never initialized by the Swig program).
 */
export async function fetchSwigAccountSafe(swigAddress: string): Promise<boolean> {
    try {
        const info = await getRpc().getAccountInfo(new PublicKey(swigAddress));
        return !!info && info.data.length > 0 && info.owner.toBase58() === SWIG_PROGRAM_ID;
    } catch {
        return false;
    }
}

// ─── Copy-trade executor authority (docs/exp-callouts.md §4d walk-away) ──────
// The "prepaid card" model: enabling auto-copy adds a role for the global copy
// executor pubkey scoped to a RECURRING on-chain USDC spend limit — the chain
// enforces the daily cap and resets it per window; the executor key can do
// nothing beyond it. The FROST root signs the add/remove exactly like session
// creation (2-round FROST, treasury pays). No COPY_EXECUTOR_SECRET env set =
// the whole feature is inert.

const USDC_MINT_PK = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const COPY_WINDOW_SLOTS = BigInt(216_000); // ~24h at 400ms/slot — the on-chain reset window

export function getCopyExecutorKeypair(): Keypair | null {
    const key = process.env.COPY_EXECUTOR_SECRET;
    if (!key) return null;
    return Keypair.fromSecretKey(Buffer.from(key, 'base64'));
}

export function copyExecutorAvailable(): boolean {
    return !!process.env.COPY_EXECUTOR_SECRET;
}

/** The executor role id on a wallet, or null if auto-copy was never enabled. */
export async function findCopyExecutorRoleId(swigAddress: string): Promise<number | null> {
    const executor = getCopyExecutorKeypair();
    if (!executor) return null;
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    const role = swig.findRolesByEd25519SignerPk(executor.publicKey)[0];
    return role ? role.id : null;
}

/**
 * Build the add-authority tx granting the executor its capped role. Root
 * (FROST) signature is added externally via the 2-round protocol; treasury
 * pre-signs as fee payer. Mirrors prepareSessionTransaction packaging.
 */
export async function prepareAddCopyAuthorityTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
    dailyUsdcBaseUnits: bigint,
): Promise<{ txBase64: string }> {
    const treasury = getTreasury();
    const executor = getCopyExecutorKeypair();
    if (!executor) throw new Error('COPY_EXECUTOR_SECRET not set — auto-copy is disabled');
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    // Explicitly the non-session role. A signer lookup can't return a session
    // authority anyway (its signer is the zeroed sessionKey), so [0] was never
    // truly ambiguous — but stating the intent means this keeps working if the
    // SDK ever indexes session authorities by their authority pubkey.
    const rootRole = swig.findRolesByEd25519SignerPk(frostPubkey).find((r) => !r.isSessionBased());
    if (!rootRole) throw new Error('FROST root role not found on Swig wallet');
    if (swig.findRolesByEd25519SignerPk(executor.publicKey)[0]) {
        throw new Error('Auto-copy already enabled on this wallet');
    }

    const actions = Actions.set()
        .tokenRecurringLimit({ mint: USDC_MINT_PK, recurringAmount: dailyUsdcBaseUnits, window: COPY_WINDOW_SLOTS })
        .get();
    const ixs = await getAddAuthorityInstructions(
        swig,
        rootRole.id,
        createEd25519AuthorityInfo(executor.publicKey),
        actions,
        { payer: treasury.publicKey },
    );

    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...ixs);
    tx.partialSign(treasury);
    return { txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}

/**
 * Build the update-authority tx replacing the executor role's actions with a
 * new recurring cap (root-signed) — cap changes without disable→enable.
 */
export async function prepareUpdateCopyAuthorityTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
    dailyUsdcBaseUnits: bigint,
): Promise<{ txBase64: string }> {
    const treasury = getTreasury();
    const executor = getCopyExecutorKeypair();
    if (!executor) throw new Error('COPY_EXECUTOR_SECRET not set — auto-copy is disabled');
    const { getUpdateAuthorityInstructions } = await import('@swig-wallet/classic');
    const { updateAuthorityReplaceAllActions } = await import('@swig-wallet/lib');
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    // Explicitly the non-session role. A signer lookup can't return a session
    // authority anyway (its signer is the zeroed sessionKey), so [0] was never
    // truly ambiguous — but stating the intent means this keeps working if the
    // SDK ever indexes session authorities by their authority pubkey.
    const rootRole = swig.findRolesByEd25519SignerPk(frostPubkey).find((r) => !r.isSessionBased());
    if (!rootRole) throw new Error('FROST root role not found on Swig wallet');
    const executorRole = swig.findRolesByEd25519SignerPk(executor.publicKey)[0];
    if (!executorRole) throw new Error('Auto-copy is not enabled on this wallet');

    const actions = Actions.set()
        .tokenRecurringLimit({ mint: USDC_MINT_PK, recurringAmount: dailyUsdcBaseUnits, window: COPY_WINDOW_SLOTS })
        .get();
    const ixs = await getUpdateAuthorityInstructions(
        swig,
        rootRole.id,
        executorRole.id,
        updateAuthorityReplaceAllActions(actions),
        { payer: treasury.publicKey },
    );
    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...ixs);
    tx.partialSign(treasury);
    return { txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}

/** Build the remove-authority tx revoking the executor role (root-signed). */
export async function prepareRemoveCopyAuthorityTransaction(
    swigAddress: string,
    frostGroupPubkeyBase64: string,
): Promise<{ txBase64: string }> {
    const treasury = getTreasury();
    const executor = getCopyExecutorKeypair();
    if (!executor) throw new Error('COPY_EXECUTOR_SECRET not set — auto-copy is disabled');
    const swig = await fetchSwig(getRpc(), new PublicKey(swigAddress));
    const frostPubkey = new PublicKey(Buffer.from(frostGroupPubkeyBase64, 'base64'));
    // Explicitly the non-session role. A signer lookup can't return a session
    // authority anyway (its signer is the zeroed sessionKey), so [0] was never
    // truly ambiguous — but stating the intent means this keeps working if the
    // SDK ever indexes session authorities by their authority pubkey.
    const rootRole = swig.findRolesByEd25519SignerPk(frostPubkey).find((r) => !r.isSessionBased());
    if (!rootRole) throw new Error('FROST root role not found on Swig wallet');
    const executorRole = swig.findRolesByEd25519SignerPk(executor.publicKey)[0];
    if (!executorRole) throw new Error('Auto-copy is not enabled on this wallet');

    const ixs = await getRemoveAuthorityInstructions(swig, rootRole.id, executorRole.id, { payer: treasury.publicKey });
    const { blockhash } = await getRpc().getLatestBlockhash('confirmed');
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: treasury.publicKey }).add(...ixs);
    tx.partialSign(treasury);
    return { txBase64: tx.serialize({ requireAllSignatures: false }).toString('base64') };
}
