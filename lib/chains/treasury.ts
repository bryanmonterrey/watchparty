/**
 * Where platform fees are paid.
 *
 * These are RECEIVE addresses, and a receive address is public by construction
 * — it appears on-chain in every transaction that pays it, and the Solana one
 * has always shipped inside the client bundle as NEXT_PUBLIC_TREASURY_PUBKEY.
 * So they are defaults in code rather than secrets, and the env var still wins
 * wherever it is set.
 *
 * They are defaults rather than requirements because a missing variable here
 * does not fail — it silently stops charging a fee, which is the kind of thing
 * that goes unnoticed for months. A committed default cannot go missing.
 *
 * (This used to also work around deploy-container.yml applying only
 * DOTENV_PRODUCTION and never DOTENV_OVERRIDES, which meant a var added via
 * overrides was live on one deploy path and absent on the one serving the
 * domains. All six restore steps across the three workflows were unified on
 * 2026-08-19, so env delivery is uniform now and either route works.)
 *
 * Read through the functions rather than at module scope: on Workers the
 * environment is not necessarily populated at import time.
 */

/** bech32 P2WPKH. Fees ride as an extra output on the user's own send. */
const BTC_DEFAULT = "bc1qx644xg0llew9ct40s2h70mu6lj86vl83862uuh";

/**
 * payingheavy.eth — the EVM treasury. Target of the accrued-fee sweep on every
 * EVM chain.
 *
 * One address serves all of them: the same secp256k1 key is the same account on
 * Ethereum, Base, Polygon and BNB. The app never SIGNS with it, only sends to
 * it, so no private key is needed anywhere in the codebase or in env.
 *
 * Note for anyone reading a query later: this address is ALSO linked to the
 * owner's account in `linked_wallets`, so it shows up in wallet lookups. That
 * is expected, not a data error.
 */
const EVM_DEFAULT = "0x93496D3B5b9bd4E0355Db047c9FA7df05C97c972";

export function treasuryBtcAddress(): string {
    return process.env.TREASURY_BTC_ADDRESS || BTC_DEFAULT;
}

export function treasuryEvmAddress(): string {
    return process.env.TREASURY_EVM_ADDRESS || EVM_DEFAULT;
}
