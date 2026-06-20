# Implement Glide — Universal Funding (deferred)

> Status: **researched, not built.** This is a future-implementation guide so we can
> pick it up later without re-deriving the decision. Nothing in the codebase depends
> on this yet.

## TL;DR

Add "universal funding" to watchparty: a user tops up **once, in whatever token they
already have, on whatever chain (or from a CEX like Coinbase/Binance)**, and it arrives
as **USDC on Solana** in their existing in-app wallet. Built **headless** (our own UI),
with **zero EVM code** in the app, via [Glide](https://buildwithglide.com)'s
`createPaymentSession` transfer mode. Kept **dormant until a key is present**, mirroring
the existing MoonPay pattern.

## Why this, and why Glide

- The app is **Solana-only** (see memory `no-evm`). Universal funding's value is letting
  non-Solana / CEX funds in **without** dragging EVM wallet SDKs into the app bundle.
- The deposit-address model does that: the user sends from *their own* wallet/exchange,
  so the source-side signing happens outside our app. No wallet-adapter, no EVM, no widget.
- watchparty already has the two pieces that make Glide a clean fit:
  - **A known per-user destination address** — `server/routers/wallet.ts` mints a custodial
    Solana keypair per user (encrypted privkey, server-side signing). That address is the
    Glide `recipientWallet`.
  - **A "hosted provider behind a tRPC procedure, dormant until keyed" precedent** —
    MoonPay (`lib/moonpay.ts`, `wallet.getMoonPayBuyUrl`, `views/buy/buy-view.tsx`). Glide
    follows the same shape.

### What Glide actually adds vs what we already have

Net-new *external* value can only enter three ways. Be honest about which is which:

| Path | Mechanism | Status |
|---|---|---|
| Fiat → SOL | MoonPay | Wired but **dormant** (API keys not approved yet) |
| **Cross-chain / CEX crypto → your token** | **Glide (this doc)** | **The gap. Not built.** |
| Same-chain SPL → your token | Jupiter swap | Already covered by the wallet **Swap** view — NOT new money, just a swap of funds already in-wallet |

So Glide's monthly fee buys exactly **one** capability: cross-chain + CEX inflow. There is
no free DIY substitute for it except building the deposit-address watcher ourselves
(see Alternatives).

## The decision: which Glide surface

Glide exposes three integration surfaces. Only the third fits us.

| Surface | Package / API | UI | Payer signs in-app? | Use? |
|---|---|---|---|---|
| `useGlideDeposit` | `@paywithglide/glide-react` | **Their** prebuilt modal | n/a | ❌ not our UI |
| `createSession` / `executeSession` / `listPaymentOptions` | `@paywithglide/glide-js` | Ours | **Yes — wagmi (EVM in app)** | ❌ breaks no-EVM |
| **`createPaymentSession` (transfer mode)** | `@paywithglide/glide-js` | **Ours** | **No — user sends to an address** | ✅ **this one** |

The public example repos (below) all use the **wrong** surface for us (`executeSession` +
wagmi). They're useful only for SDK setup (`createGlideConfig`), not the flow.

## Verified facts (checked against docs, June 2026)

- **Headless deposit address is real.** `createPaymentSession` with `paymentAction:
  "transfer"` returns `session.depositAddress`. Docs: *"User manually transfers
  cryptocurrency to the `depositAddress`"* — no in-app auth, any external wallet/exchange.
- **`stableDepositAddressKey`** returns the **same address for repeat sessions** → key it
  per user (`wp-user-<userId>`) so each user has a stable deposit address.
- **Solana is a supported settlement chain** (chain id `eip155:solana:101`): settle in
  **SOL, USDC, USDT, or PYUSD** on Solana. We settle **USDC on Solana** into the user's
  custodial address.
- **Self-serve signup exists** (this was in doubt — it's resolved): `https://app.paywithglide.xyz/signup`
  ("Integrate now" / "Start your free trial"), dashboard at `https://app.paywithglide.xyz`.
  The `projectId` comes from that dashboard. The deposit-widget doc's *"App ID provided by
  Glide Team"* is stale enterprise phrasing.
  - Signal: the "schedule a call" link is `calendly.com/tusharsoni` — Glide team, same
    `tusharsoni` who authored the `glide-privy-paragraph` reference repo. Small/founder-
    accessible project; if onboarding ever friction, you can book the founder.

## Pricing & "when do I pay" — ⚠️ UNVERIFIED, confirm at signup

- `$99/month` plan seen in their dashboard (reported, not independently confirmed here).
- A **free trial** exists (website CTA), but **length and billing trigger are unconfirmed.**
- **There is NO documented "you only pay on launch."** That was an assumption. The real
  lever is ours: **build during the free trial, keep the integration dormant, and do not
  upgrade to the paid plan until launch.** Billing almost certainly starts when you
  subscribe to paid — regardless of usage (standard SaaS).
- Possible per-transaction / spread fees on top of the monthly — **unconfirmed.**
- **Action item before committing:** log into `app.paywithglide.xyz`, confirm trial length,
  exact monthly price, billing-start trigger, and any per-tx fees. Update this section.

## Target architecture in watchparty

Provider-agnostic so we're never locked to Glide's pricing/approval mood. Swapping to
Unifold or a roll-your-own rail later should be a **one-file adapter change**.

```
components/wallet/wallet-drawer/views/add-funds/   <- NEW drawer view (our UI)
  add-funds-view.tsx        (token/chain picker -> shows depositAddress + QR + status)

server/routers/funding.ts                          <- NEW tRPC router
  - interface FundingProvider { getDepositAddress(); getStatus(); }
  - glideProvider implementation (createPaymentSession transfer mode)
  - dormant if GLIDE_PROJECT_ID absent (mirror MoonPay)

lib/funding/glide.ts                               <- server-only Glide adapter
  - createGlideConfig({ projectId: process.env.GLIDE_PROJECT_ID })
```

### Server flow (inside the tRPC router)

```ts
import { createGlideConfig, createPaymentSession } from "@paywithglide/glide-js";

const glide = createGlideConfig({ projectId: process.env.GLIDE_PROJECT_ID! });

// getDepositAddress (protectedProcedure)
const session = await createPaymentSession(glide, {
  settleCurrency: SOLANA_USDC,                 // CAIP-19 for USDC on Solana — CONFIRM string
  recipientWallet: user.custodialSolanaAddress, // from wallet router
  paymentAmount: input.amount,                  // optional in pure "receive" mode — verify
  stableDepositAddressKey: `wp-user-${ctx.userId}`,
});

if (session.paymentAction === "transfer" && session.depositAddress) {
  return { address: session.depositAddress, sessionId: session.id /* verify field */ };
}
```

### Client flow (the Add Funds view — our UI)

1. User opens **Add Funds** (new drawer action, alongside Receive/Send/Swap/Buy).
2. Call `funding.getDepositAddress` → render `address` as **our** QR + copy button.
3. Poll `funding.getStatus` (`useQuery`, refetchInterval) until settled → refresh balance,
   show our success state. (Or wire a Glide webhook → Next.js route handler for push.)
4. Glide bridges/swaps from whatever the user sent → delivers **USDC on Solana** to the
   custodial address.

### Invariants to respect (project rules)

- **Speed rule:** the Glide SDK is heavy — lazy-load it. The router is server-side (fine);
  the drawer view goes behind `next/dynamic` + `ssr: false` like the settings panels.
  `dynamic()` options must be **inline object literals** (Turbopack).
- **No EVM:** the `glide-js` SDK lists `@solana/web3.js` as an optional peer and is
  otherwise EVM-shaped — make sure only the transfer/session-create path is imported
  server-side; never pull `executeEVMSession`/wagmi paths into the client bundle.
- **Dormant default:** absent `GLIDE_PROJECT_ID`, `getDepositAddress` throws a friendly
  "funding not enabled" and the Add Funds crypto section stays dark. No broken UI.
- **Keys server-side only.** `projectId` (and any secret) live in `.env`, used only in the
  tRPC router / `lib/funding/`. Never ship to client.

## Open questions to resolve at build time

1. Exact CAIP-19 `settleCurrency` string for **USDC on Solana** (lift from the
   supported-chains table / dashboard).
2. The **status/polling** function or webhook event name (docs reference a session lookup —
   confirm the exact API).
3. Whether `paymentAmount` is required in pure "receive/top-up" mode or can be open-ended.
4. `createPaymentSession` return shape — field names for `id` / status handle.
5. Whether the call needs a server **API key** in addition to `projectId`.
6. Confirm pricing/billing terms (see Pricing section).

## Alternatives (the swap-out plan if Glide's price/terms don't work)

Recommended order at launch:

1. **Glide** — fastest, headless, self-serve. Pay $99/mo (unconfirmed) once live.
2. **Unifold** (`unifold.io`, YC W26) — same headless deposit model, explicitly positioned
   *against* volume-minimums/sales-gating, self-serve, small-team-friendly. Pricing not
   public — sign up to compare. Likely cheaper/free early.
3. **Roll-your-own** — deBridge DLN or LI.FI REST API + Jupiter, delivering into the
   custodial wallet. **$0 fixed cost** (they monetize on spread; you can even add an
   affiliate fee to *earn* on deposits). Cost is **engineering**: you build the
   cross-chain deposit-address watcher + some EVM server-side infra + refund/failure
   handling. Endgame for zero-fee, not a weekend.

Because the router is provider-agnostic, switching is an adapter swap, not a rewrite.

## Reference repos (cloned to /tmp/funding-research during research)

- `tusharsoni/glide-privy-paragraph` — first-party (founder), **bun**, latest SDK; shows
  `createGlideConfig` + session lifecycle. (Uses the wagmi/EVM path — setup only.)
- `mykcryptodev/split-the-bill` — clean `PayCrossChain.tsx` with `createSession` /
  `listPaymentOptions` / `executeSession`. (Wrong surface for us, good for SDK shape.)
- `sidrisov/payflow` — fuller production app on glide-js.
- Docs: `https://docs.buildwithglide.com/typescript/create-payment-session/`,
  `https://docs.buildwithglide.com/resources/supported-chains-and-tokens/`,
  `https://docs.buildwithglide.com/guides/embed-glide-deposit` (the widget — not us).

## Implementation checklist (when we pick this up)

- [ ] Confirm pricing/billing terms at `app.paywithglide.xyz`; update Pricing section.
- [ ] Sign up, create project, get `projectId` → `.env` as `GLIDE_PROJECT_ID` (+ any key).
- [ ] `bun add @paywithglide/glide-js`.
- [ ] `lib/funding/glide.ts` — `createGlideConfig` + `getDepositAddress`/`getStatus` adapter.
- [ ] `server/routers/funding.ts` — provider interface + glide impl + dormant guard; register in `server/routers/index.ts`.
- [ ] Resolve open questions (settleCurrency, status API, paymentAmount, return shape).
- [ ] `views/add-funds/add-funds-view.tsx` — our QR/status UI; lazy via `next/dynamic` ssr:false.
- [ ] Add "Add Funds" action to `wallet-actions.tsx` (gated on provider enabled).
- [ ] Verify: `npx tsc --noEmit`; confirm no EVM/wagmi code reaches the client bundle.
- [ ] End-to-end test on Glide testnet (Solana devnet USDC) before flipping live.
