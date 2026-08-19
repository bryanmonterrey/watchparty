# Next session — start here

Written 2026-08-18. Everything below is committed, pushed and deployed green
unless marked otherwise. Ordered by what actually matters, not by what was most
recent.

---

## 0. READ THIS FIRST: nothing in the buy/swap flow has ever moved real money

A whole multichain buy/swap stack shipped this session. **Every QUOTE path is
verified against live APIs. No EXECUTION path has ever been signed.** Not the
same-chain EVM swap, not the bridge, not the Solana signer, not the swap card.

It type-checks, guards pass, tests pass, CI is green, and none of that touches a
signature. Do not treat "the buy flow works" as established, and do not build on
top of it as though it were.

The first real transaction is still the test. Start with the smallest amount
that will route. The riskiest single line is `Keypair.fromSeed` vs
`fromSecretKey` in `lib/chains/swap/solana-lifi.ts` — SLIP-0010 yields the
32-byte seed, and the wrong constructor **signs as a different account** rather
than failing. There is a pubkey-vs-address assertion guarding it.

Blocked on one thing first: **the owner's account has no wallet** (no legacy
`user.wallet_address`, zero `wallet_addresses` rows). Only 7 of 31 accounts have
multichain rows. The buy dialog now provisions one inline, so the path is:
open Buy on any coin → create wallet in place → buy something tiny.

---

## 1. The money paths earn almost nothing right now (unresolved)

Asked and answered this session; **no code was changed**, because both fixes are
decisions rather than edits.

- **Solana is configured at 1%** (`JUPITER_PLATFORM_FEE_BPS=100`, referral
  account set in all envs) **but mostly is not collected.** Jupiter pays the fee
  into a referral ATA that must exist PER OUTPUT MINT. Checked the top three
  Solana board coins: all three MISSING. Only WSOL/USDC exist — the ones set up
  deliberately. Every new coin needs its ATA initialised once, and nothing in
  the codebase does that.
- **Every non-Solana buy earns exactly $0.** LI.FI is called with no
  `integrator` and no `fee`. Tested adding them: refused outright —
  *"Integrator 'watchparty' is not configured for collecting fees. Sign up on
  https://portal.li.fi/ and configure your fee wallet."*

**ANSWERED 2026-08-19 — it was the second thing, and worse (`5692a8d2`).** A
non-existent `feeAccount` does not reject the build: `POST /swap` returns **200
with a transaction**, and it reverts at EXECUTION as Jupiter error `6025`. So
every Solana board buy was failing on-chain *after the user signed*, which
presents as a wallet/signing fault, not a config one — **24 of the top 25
Solana board coins had no referral ATA** (only SOL; USDC is the other one that
exists but is not on the board).

Fixed: the fee is requested at QUOTE time only when the ATA exists, and the
swap derives `feeAccount` from the quote's own `platformFee`
(`lib/jupiter/referral-fee.ts`). Verified by simulating against mainnet state —
USDC still charges, BONK went from `6025` to clean.

Note for §0: this would have hit the first funded test, and the obvious suspect
would have been the `Keypair.fromSeed` line flagged there. It wasn't.

**COLLECTING IT: SOLVED, and the ATA plan is dead.** Jupiter bills the fee to
whichever side you hand it an account for — measured by simulating and reading
the fee account's balance delta, buying BONK with 0.01 SOL credits exactly
100,000 lamports to the **wSOL** account (1% of the INPUT), even though the
quote still denominates `platformFee` in the output mint. Every swap here has
SOL or USDC on one side and those two referral ATAs already exist, so the 1%
now collects on **every coin** with no per-mint setup and no ~0.00204 SOL of
rent per coin, forever. The fee also arrives in SOL instead of in memecoins.

`resolveFeeAccount` prefers the input side and falls back to the output side
(which is what makes sells work). Do NOT re-derive the account at swap time
from a guessed side — on a sell the input account is exactly the one that does
not exist. `feeAccountForSwap` takes it from the quote and only re-resolves
when it is missing.

⚠️ **Never read a clean simulation as proof of collection.** A silently skipped
fee simulates exactly as well as a charged one. The proof is the fee account's
balance delta, which is what `tests/jupiter-referral-fee.test.ts` records.

---

## 2. Stripe card funding — built, inert, waiting on a legal entity

Full checklist and the traps are in `docs/TODO.md` under "Incorporate + Stripe
onramp". Short version: the code turns on with `STRIPE_SECRET_KEY` in the
`DOTENV_OVERRIDES` GitHub secret, and what it is waiting on is an entity Stripe
can verify, not engineering.

Two facts that will otherwise be rediscovered the hard way: the onramp
application **gates the sandbox too** (a valid key errors until approval), and
Stripe can **never** fund BNB / HyperEVM / Robinhood — they are not on its
network list. MoonPay covers BNB and is already in the tree (Solana-only today).

---

## 3. `linked_wallets` made accounts plural; ~130 readers are still singular

The highest-yield bug class in the repo right now. `user.wallet_address` mirrors
only the PRIMARY of up to 15 linked wallets, and its schema comment says the
mirror exists "so the ~135 existing readers keep working untouched". They kept
working. They also became wrong.

THREE bugs from this in one session, all fixed — sign-in 401 "Wallet mismatch"
(`0ec39828`), invisible balances in the buy dialog (`354ea325`), and the wallet
drawer listing the BROWSER's extensions instead of the account's wallets
(`d6a2f4dc`).

**Expect more.** When anything wallet-shaped misbehaves for a multi-wallet
account, ask: does matching the primary need to be NECESSARY here, or only
SUFFICIENT? It is almost always only sufficient. Concentrated in
`server/routers` (42 refs), `components/wallet` (38), `lib/auth` (10).

---

## 4. Environment traps that cost real time this session

- **The owner reviews on SAFARI.** A Chrome check is not verification. A
  positioned `<tr>` is a containing block in Chrome/Firefox and NOT in WebKit —
  that washed the ENTIRE home centre column on hover (`9f5ea0d1`), and the code
  comment claiming it was "verified in the browser" had been verified in one.
  None of this project's gates can catch it: tsc, the guards and `bun test` are
  engine-agnostic, and the browser tools drive Chrome.
- **`tsc` gets reaped at 600s here** (exit 144 = SIGTERM, not OOM) and an
  interrupted run leaves an **EMPTY log, which reads exactly like a pass**. Run
  it detached with an explicit marker:
  `nohup bash -c '... tsc --noEmit > /tmp/t.log 2>&1; echo "TSC_EXIT=$?" >> /tmp/t.log' &`
  then wait for the marker. VS Code also runs two `tsserver` instances at
  `--max-old-space-size=8192` on an 8GB machine, which is most of the pressure.
- **This checkout is shared with other Claude sessions.** Commit by pathspec,
  and read a "cancelled" CI run as a peer's push rather than a failure — verify
  with `git merge-base --is-ancestor <yours> HEAD` before assuming work is lost.
- **Guards are not gated by the commit command.** Running guards and `git
  commit` in one `&&`-less block will happily push a red guard (done once this
  session, `90497d4c`). Check the output.

---

## 5. Shipped this session (context, not TODO)

Buy dialog on /home replacing an instant no-confirmation swap and a
GeckoTerminal redirect; buyable on Solana + 6 EVM chains; cross-chain routing
from any EVM or Solana source; pay with any held coin or card; hold-to-confirm;
inline wallet setup; USD presets; liquidity/depth warning.

Fixes worth knowing about because they were invisible: BNB/Ethereum/Polygon were
never buyable (two slug spaces in one column — now covered by
`tests/buyable-chains.test.ts`); the `sign_transaction` rate limit was DEAD
app-wide (async `checkRateLimit` never awaited); copycat dedupe picked the
wash-traded twin because it selected on volume (now liquidity —
`tests/collapse-copycats.test.ts`).

Coin page: stat cards now poll (they were frozen at server render), Swaps and
Tags tabs actually exist (the tab state previously only recoloured a label), and
the swap card gained the dialog's protections.

---

## 6. Genuinely open

- The funded test above. Everything else is downstream of it.
- **LI.FI integrator registration — the largest uncollected line, and only the
  owner can do it.** Every EVM and cross-chain swap earns $0: LI.FI is called
  with no `integrator` and no `fee`, and refuses both until registration.
  Confirmed against the live API 2026-08-19:

  ```
  no integrator (today)              -> 200  quote OK      (earns $0)
  integrator=watchparty + fee=0.01   -> 400  "Integrator \"watchparty\" is not
                                             configured for collecting fees"
  ```

  Steps, in order:
  1. Sign up at https://portal.li.fi/.
  2. Create the integrator keyed **exactly** `watchparty` — that string is what
     `lib/chains/swap/lifi.ts` sends; any other spelling needs a code change.
  3. Configure TWO fee wallets, because one integrator covers both ecosystems:
     EVM `0x93496D3B5b9bd4E0355Db047c9FA7df05C97c972` (payingheavy.eth) and
     Solana `NEXT_PUBLIC_TREASURY_PUBKEY` (`C9kxy…`), since `solana-lifi.ts`
     routes Solana through LI.FI too.
  4. Set the fee to `0.01` (1%), matching every other chain.
  5. Take an API key if offered — `li.quest` is called unauthenticated today.

  Then the wiring is small: add `integrator` and `fee` to the quote params in
  `lib/chains/swap/lifi.ts`. The 400 above turning into a 200 is the proof.
- **Rates are 1% on every chain** (`lib/chains/fee-bps.ts`, dependency-free so
  client and server share it). Sends were 0.5% until 2026-08-19. The 5% in
  `subscription.ts` is deliberately untouched — that is the platform's cut of
  creator revenue, not a chain fee.
- **Treasury addresses are committed defaults** in `lib/chains/treasury.ts`,
  env-overridable. They are receive addresses, public on-chain the moment they
  are used, and a missing env var here does not fail loudly — it just stops
  charging.
  ⚠️ The EVM one is payingheavy.eth, which is a LINKED USER WALLET rather than a
  treasury. Harmless while volume is zero; wants a dedicated wallet before it
  is not.
- **Env now reaches every deploy path.** All six `Restore .env` steps across
  deploy.yml (4), deploy-container.yml and preview.yml apply
  `DOTENV_PRODUCTION` + `DOTENV_OVERRIDES` identically. Before 2026-08-19 only
  deploy.yml's first step read the overrides secret — and
  **deploy-container.yml serves the domains**, so a var added via overrides was
  live on one path and silently absent on the one that matters.
- **Tags have zero usage**: `post_tags` has 0 rows and not one of 81 posts
  contains a cashtag. The feature is complete end to end — the lever is
  discoverability of the composer's `$` picker, not code. Note that typing
  `$PEPE` manually creates NO tag; only selecting from the dropdown does.
- **Server tag needs a data path**: the post-card slot exists and renders when
  given `serverTag`, but nothing chooses WHICH server a user represents.
  `communityServers.tag` already exists; the missing piece is a nullable
  `user.server_tag_id`, a picker, and a join in the post query.
- Older, unrelated: GCP billing (Phoenix/feed ranker down since 2026-08-09) and
  the Typesense cluster (NXDOMAIN).
