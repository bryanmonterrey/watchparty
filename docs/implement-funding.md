# Implement Universal Funding (deferred)

> Status: **researched, not built.** Future-implementation guide so we can pick this up
> later without re-deriving the decision. Nothing in the codebase depends on this yet.
> Supersedes the earlier `implement-glide.md` (Glide is now a fallback, not the pick).

## The goal (unchanged)

A user tops up **once, in whatever token they already have, on whatever chain — or from a
CEX like Coinbase/Binance** — and it arrives as **USDC (or SOL) on Solana** in their
existing in-app custodial wallet.

## THE HARD REQUIREMENT (drives everything)

**Only our own UI. No widget, no embed, no third-party UI anywhere in the app.**

Implication: we need a **headless data API** — it returns a deposit address + status as
JSON, and we render every pixel. Any product whose self-serve tier is "drop in our widget"
is disqualified for the in-app surface.

Also unchanged: **Solana-only, zero EVM in the app bundle** (see memory `no-evm`).

## The crux you cannot engineer around

"Deposit from anywhere, **including from a CEX**" fundamentally requires a **hosted watcher**:
a service that owns a receiving address, watches it across chains, bridges, and settles to
your chain. Either a provider runs that watcher, or **you build it**. There is no option
that is simultaneously: your-own-UI + no-provider + free + supports-CEX-withdrawals.

So the real choice is **"rent the watcher (Unifold) vs build the watcher (roll-your-own)."**

## Decision

| Option | Your UI? | Self-serve | Solana | Fixed cost | Docs verifiable now | Verdict |
|---|---|---|---|---|---|---|
| **Unifold** | ✅ headless API | ✅ `dashboard.unifold.io` | ✅ | unknown (not public) | ❌ login-gated | **Primary** |
| **Roll-your-own** (deBridge/LI.FI) | ✅ (you build it) | ✅ permissionless | ✅ | **$0** (spread only) | ✅ fully public | **Fallback / $0 endgame** |
| **Glide** | ⚠️ self-serve is **widget-first**; headless API access unconfirmed | ✅ (Deposit Mode) | ✅ (USDC/SOL/USDT/PYUSD) | ~$99/mo (reported, unverified) | partial | **Demoted** — fails the hard requirement on self-serve |

**Why the flip from Glide → Unifold:** during signup, Glide's self-serve **Deposit Mode**
funnels you into *"Configure Deposits Widget"* (App ID + their modal UI). The headless
`createPaymentSession` path is documented but we could **not confirm** it's available to a
self-serve Deposit-Mode project (vs. gated). Glide's *Pay Mode* (merchant checkout) is
**CONTACT SALES**. Unifold's entire pitch is the opposite: *"headless mode for teams seeking
full control,"* self-serve, full API access — which is exactly our hard requirement.

## Provider A (PRIMARY): Unifold

### What's verified (from public landing / YC, June 2026)
- *"Unifold's API can operate in a **headless mode for teams seeking full control**"* +
  *"Full API access to configure routing rules, policies, and settlement preferences."*
- Per-user dedicated deposit addresses via API.
- Accepts any token on any chain, auto-converts to your settlement currency.
- **Solana supported** as destination.
- **Self-serve**: `dashboard.unifold.io` ("Get started"); "Talk to sales" is the enterprise
  option, not a gate.
- YC W26, ~$1M raised. **Very new** — small track record. Fine for build-now/launch-later.

### Public API signature (PROVISIONAL — docs are login-gated, verify after signup)
```ts
beginDeposit({
  externalUserId: ctx.userId,                    // our user id
  destinationChainType: "solana",
  destinationChainId: <solana mainnet id>,        // CONFIRM exact value
  destinationTokenSymbol: "USDC",                 // or "SOL"
  destinationTokenAddress: <USDC mint on Solana>, // CONFIRM
  recipientAddress: user.custodialSolanaAddress,  // their in-app wallet
})
// → returns a deposit address (+ id/expiry?) to render in OUR UI
// → Unifold notifies (webhook) when the deposit confirms/settles
```

### ⚠️ Unverifiable from here — MUST read after signing up
Docs at `docs.unifold.io/get-started/quickstart` redirect to `/login` (HTTP 302). After you
create an account, grab these and paste them back so we wire it exactly:
1. Auth model — API key location (dashboard), header format.
2. **Exact `beginDeposit` response shape** — field names for the deposit address, deposit id,
   expiry.
3. **Status mechanism** — polling endpoint vs webhook; webhook event names + payload schema.
4. Solana `destinationChainId` / `destinationTokenAddress` (USDC mint) exact values.
5. npm package / SDK name (or is it raw REST?). Server-side vs client.
6. **Pricing** — not public; confirm on the dashboard (monthly? per-tx? free tier?).

## Provider B (FALLBACK / $0 endgame): roll-your-own

deBridge DLN or LI.FI REST API for the bridge/swap leg + Jupiter for the final Solana hop,
delivering into the custodial wallet.

- **Pros:** 100% our UI (guaranteed — there's no vendor UI to begin with), **public/verifiable
  docs**, **$0 fixed cost** (they monetize on spread; we can add an affiliate fee to *earn*
  on deposits), no vendor lock-in, no approval/signup gate.
- **Cons / the catch:** to accept deposits **from anywhere incl. CEX**, *we* run the
  deposit-address watcher — receiving addresses on source chains, watching, bridge
  orchestration, refund/failure handling. This pulls **EVM server-side infra** in (not the
  client bundle, so the no-EVM-in-app rule is technically intact, but it's real backend).
- deBridge/LI.FI's simpler "construct tx → user signs" model is NOT viable for us — it needs
  the payer to sign on the source chain (EVM wallet in-app), which breaks the requirement.

Pick this if Unifold's pricing/maturity disappoints and we're willing to spend engineering
to get to $0 fixed cost.

## Provider C (DEMOTED): Glide — reference only

Kept for completeness; only revisit if Unifold falls through AND Glide ships a confirmed
headless self-serve path.

- **Surfaces:** `useGlideDeposit` (widget — ❌), `createSession/executeSession` (wagmi/EVM
  sign-in-app — ❌), `createPaymentSession` transfer mode (headless `depositAddress` — the
  only acceptable one, but self-serve availability unconfirmed).
- **Verified:** Solana settlement (USDC/SOL/USDT/PYUSD, chain id `eip155:solana:101`);
  headless `createPaymentSession` returns `session.depositAddress` with
  `stableDepositAddressKey` for stable per-user addresses; self-serve signup at
  `app.paywithglide.xyz` (Deposit Mode).
- **Blocked on:** confirming `createPaymentSession` works with a self-serve Deposit-Mode
  project (the signup pushes the widget). Pricing/billing terms unverified (~$99/mo reported;
  no documented "pay only on launch" — that lever is just *not subscribing to paid until
  launch*).
- npm: `@paywithglide/glide-js`. First-party reference repo: `tusharsoni/glide-privy-paragraph`
  (founder; uses the wagmi path though).

## Target architecture in watchparty (provider-agnostic)

Built so swapping providers is a **one-file adapter change**, never a rewrite.

```
components/wallet/wallet-drawer/views/add-funds/   <- NEW drawer view (OUR UI)
  add-funds-view.tsx        (token/chain picker -> our QR of depositAddress + our status UI)

server/routers/funding.ts                          <- NEW tRPC router
  interface FundingProvider { getDepositAddress(); getStatus(); }
  - unifoldProvider  (beginDeposit)         <- primary
  - (glideProvider / rollYourOwnProvider behind same interface)
  - dormant if no provider key in env (mirror MoonPay pattern)

lib/funding/<provider>.ts                          <- server-only adapter(s)
app/api/funding/webhook/route.ts                   <- provider webhook -> mark deposit settled
```

### Flow
1. User opens **Add Funds** (new action alongside Receive/Send/Swap/Buy in `wallet-actions.tsx`).
2. `funding.getDepositAddress` → `beginDeposit(... recipientAddress = custodial address ...)`
   → render address as **our** QR + copy button.
3. User sends from any wallet/CEX. Provider bridges/swaps → delivers USDC/SOL on Solana.
4. Webhook (`/api/funding/webhook`) marks settled → refresh balance, show **our** success UI.
   (Fallback: poll `funding.getStatus`.)

### Invariants (project rules)
- **Speed rule:** funding SDK is heavy/server-side only; the Add Funds view goes behind
  `next/dynamic` + `ssr: false` with **inline literal** options (Turbopack).
- **No EVM in client bundle:** never import EVM/wagmi signing paths into client components.
  (Roll-your-own adds EVM *server* infra only — still no client EVM.)
- **Dormant default:** absent the provider key, `getDepositAddress` throws a friendly
  "funding not enabled"; Add Funds crypto section stays dark. Same as MoonPay today.
- **Keys server-side only**, in `.env`, used only in `server/routers/funding.ts` / `lib/funding/`.

## How this sits next to what already exists

- **Fiat → SOL:** MoonPay (`lib/moonpay.ts`, `wallet.getMoonPayBuyUrl`) — wired, **dormant**
  (keys not approved). Leave it; it covers card/fiat. Universal funding is the *crypto/CEX* gap.
- **Same-chain SPL → token:** already the wallet **Swap** view (Jupiter) — that's a swap of
  funds already in-wallet, NOT new money. Not what this feature is.
- **Custodial wallet:** `server/routers/wallet.ts` mints a per-user Solana keypair → its
  address is the universal-funding `recipientAddress`. This is why deposit-address funding
  fits us with zero new wallet/EVM client code.

## Implementation checklist (when we pick this up)

- [ ] Sign up at `dashboard.unifold.io`; read the (gated) quickstart + API reference.
- [ ] Resolve the 6 "MUST read after signup" items above; update this doc.
- [ ] Confirm Unifold pricing; if unacceptable, evaluate roll-your-own (deBridge/LI.FI).
- [ ] API key → `.env` (e.g. `UNIFOLD_API_KEY`).
- [ ] `lib/funding/unifold.ts` — `beginDeposit` adapter (`getDepositAddress`/`getStatus`).
- [ ] `server/routers/funding.ts` — provider interface + unifold impl + dormant guard;
      register in `server/routers/index.ts`.
- [ ] `app/api/funding/webhook/route.ts` — verify signature, mark deposit settled.
- [ ] `views/add-funds/add-funds-view.tsx` — our QR/status UI; lazy `next/dynamic` ssr:false.
- [ ] Add "Add Funds" action to `wallet-actions.tsx` (gated on provider enabled).
- [ ] Verify: `npx tsc --noEmit`; confirm no EVM/wagmi reaches the client bundle.
- [ ] End-to-end test on testnet (Solana devnet) before flipping live.

## Reference

- Unifold: `https://unifold.io`, `https://dashboard.unifold.io`, docs `https://docs.unifold.io`
  (login-gated), YC `https://www.ycombinator.com/companies/unifold`.
- deBridge DLN API: `https://docs.debridge.finance/.../requesting-order-creation-transaction`.
- LI.FI SDK: `https://github.com/lifinance/sdk`; Jupiter (Solana swap).
- Glide (fallback): `https://docs.buildwithglide.com/typescript/create-payment-session/`.
- Research clones (during investigation): `/tmp/funding-research/` (cctp, debridge,
  glide-privy, split-the-bill).
