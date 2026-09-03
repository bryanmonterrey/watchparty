# Share cards (OG / meta thumbnails) — plan

The image a link turns into when it is pasted on X, Discord, Telegram, iMessage,
Slack, LinkedIn, WhatsApp. One card per shareable thing, rendered on demand,
branded like the app.

Written 2026-09-03 from a survey of what existed then. §1 describes that
starting state; the phase headings in §5 say what has shipped since.

---

## 1. Where we are

### What exists

- **`og-worker/`** — a standalone Cloudflare Worker (`watchparty-og`) running
  `workers-og` (satori + resvg). It renders exactly one card, `/api/og/post`,
  from four query params (`text`, `name`, `username`, `avatar`). It has no DB,
  no secrets, deploys from the `deploy-og` job in `deploy.yml`, and answers on
  the zone route `watchparty.xyz/api/og/*` that was added by hand in the
  dashboard. **Any new path under `/api/og/` routes there automatically.** It
  lives outside the Next app on purpose: satori's wasm pushed the main worker
  over the 10 MiB cap (memory `worker-bundle-size-ceiling`). Do not add an
  `/api/og` route to the Next app again.
- **The one card is off-brand.** Black background, white panel, a gray/black
  drop shadow (banned by `docs/design-principles.md`), satori's default font
  (not Geist), no wordmark. It is also **not referenced by any page's
  metadata** — its only caller is the composer, which snapshots it to Storage
  for a token launch's on-chain metadata (`components/browse/post-composer.tsx`,
  `components/app-ui/create-dialog.tsx`).
- **Six pages have `generateMetadata`:** post (`/status/[id]`), profile
  (`/[username]`), coin (`/coin/[...slug]`), video (`/video/[videoId]`),
  prediction (`/trade/predictions/[id]`), category. Only **video** sets an
  `openGraph.images` entry, and it points at the raw thumbnail. The rest set a
  title and sometimes a description. **No page sets `twitter.card`.**
- **Root layout has no `metadataBase`, no default image, no `openGraph`, no
  `twitter` block.** So a link to `watchparty.xyz` today unfurls as bare text.
- **Crawlers can reach the pages.** `PUBLIC_BROWSING` is on, and none of the
  shareable routes are in `ALWAYS_PRIVATE_PREFIXES`, so Twitterbot et al. get
  the server-rendered `<head>`. This is load-bearing and fragile (see §7).
- **Fonts are on disk.** `app/fonts/` has every Geist weight (~128 KB each) and
  `GeistPixel-Triangle.ttf` (195 KB). `workers-og` takes a `fonts` array.
- `NEXT_PUBLIC_APP_URL` exists in `.env.production` (already read by
  `app/embed/post/[id]/page.tsx`) — the right value for `metadataBase`.

### Pages with **no** metadata at all

`/communities/[serverId]`, `/communities/[serverId]/channels/[channelId]`,
`/communities/invite/[code]`, every `(marketing)` page, `/home`, `/apps`.

---

## 2. Inventory: every shareable thing

| # | Thing | URL | Data on hand (server) | Card shows |
|---|---|---|---|---|
| 1 | **Post** (text) | `/status/[id]` | `posts.content`, author name/username/avatar/verifiedTier, likes/comments/reposts | Author strip, text (≤ ~220 chars, clamped server-side), stat pills |
| 1b | Post with **image** | same | `posts.media[0]` / `posts.imageUrl` | Image hero on the right ~45%, author + first line on the left |
| 1c | Post with **video** | same | `posts.thumbnailUrl`, `duration` | Thumbnail hero + play glyph + duration chip |
| 1d | Post with **token** | same | `posts.ticker`, `tokens.imageUrl/priceUsd/marketCapUsd` | Author strip + `$TICKER` coin chip + mcap |
| 2 | **Video** | `/video/[videoId]` | `title`, `thumbnailUrl`, `duration`, `views`, creator | **Compact card, not a generated image** (see §4a): raw thumbnail as the square on the left, title + description as text, play glyph via a `player` card backed by `/embed/video/[id]` |
| 3 | **Profile** | `/[username]` | `name`, `username`, `avatar_url`, `banner_url`, `bio`, `verifiedTier`, follower count | Avatar large, name + verified mark, @handle, bio line, followers pill |
| 3b | Profile, **live** | `/[username]` when `streams.isLive` | `streams.title/category/thumbnailUrl/viewerCount` | Stream thumbnail hero, LIVE pill, title, category, viewers, host strip |
| 4 | **Coin** | `/coin/[...slug]` | `tokens.*` or `resolveCoin()`: name, symbol, imageUrl, priceUsd, marketCapUsd, 24h change, bondingProgress, chain, creator | pump.fun anatomy (§4b): name, ticker line, "Market Cap" label, one **big glowing number**, a "See more" pill, coin image as a rounded square on the right; 24h delta and chain badge as small chips |
| 5 | **Prediction market** | `/trade/predictions/[id]` | `question`, `imageUrl`, outcomes with `poolUsdc`, `closesAt`, `status` | Question, top 2–3 outcomes with implied % bars, pool total, closes-in / RESOLVED chip |
| 6 | **Community** | `/communities/[serverId]` (channels fall back to this) | `servers.name/description`, icon, member count | Icon, name, description line, members pill |
| 6b | **Community invite** | `/communities/invite/[code]` | same via `inviteCode` | Same card with an "You're invited to" eyebrow |
| 7 | **Category** | `/category/[slug]` | static title | Static per-category card (title + brand) |
| 8 | **Default / brand** | `/`, `/home`, marketing, anything else | none | One static 1200×630 brand image |
| 9 | **PnL card** (user-generated) | `/pnl/[cardId]` + the image itself | `trades` rows for (user, mint) → cost basis, qty, realized/unrealized (`server/lib/pnl.ts`); price series from `lib/coins/candles.ts`/`sparkline.ts`; coin identity + mcap | pump.fun PnL anatomy (§9): coin strip, price line with buy/sell markers, big signed $ PnL, % pill, "<username>'s position" + date, Acquired / Average entry / Market Cap |

Not in scope now: clips and spaces (no routes exist), `/embed/*` (noindex),
`/apps` (use the default card until the directory has its own identity).

---

## 3. Architecture

### Rendering stays on `og-worker`

Same reasons as before: bundle cap, edge-cached, no DB. The worker becomes a
**template router**: `/api/og/<template>?<fields>&v=<n>`.

### Data flows in the URL, not through a DB lookup

The page's `generateMetadata` already holds the row (every one uses `cache()`
to dedupe with the page body). It encodes the fields the card needs into the
image URL. The worker renders from params only.

Why this and not "worker takes an id and fetches JSON from the app":

- **Immutable per URL.** Values in the URL mean a changed price is a changed
  URL, so `s-maxage=604800, immutable` stays honest and the edge serves most
  cards with zero renders.
- **No second hop** into the app on a path that platform crawlers hit in bursts.
- **No coupling** — the worker never needs the app up, the DB up, or a secret.

`v` is a template version param. Bump it when a template's design changes so
crawlers that re-fetch (they do, weekly-ish) get the new render instead of the
edge's cached old one.

### Two shared helpers in the app

- **`lib/share/og-url.ts`** — `ogImageUrl("post", { ... })` → absolute URL.
  One typed field set per template. Applies the length caps client-side so the
  URL stays under ~2 KB and the worker's caps are a second line, not the first.
- **`lib/share/metadata.ts`** — `shareMetadata({ title, description, image,
  path, type })` returns the `Metadata` slice every page needs and never gets
  right by hand: `openGraph` (title/description/url/siteName/type/images with
  width+height+alt), `twitter` (`summary_large_image`, title, description,
  images), `alternates.canonical`. Every `generateMetadata` spreads this. It
  fails open to the brand default on any missing field.

### Images inside cards

Avatars, thumbnails and coin logos are remote. Do **not** hand satori a URL:

- **Pre-fetch in the worker with a deadline** (`AbortSignal.timeout(2500)`)
  and pass a `data:` URI. No default fetch timeout exists in workerd (memory
  `upstream-fetch-needs-deadline`) — one hung image host would hang the card
  for every crawler. On failure, fall back to `/avatar.png` (memory
  `no-letter-avatar-fallback`) or drop the hero and render the text variant.
- **Host allowlist** in the same place: our Supabase Storage host, our own
  domain, the coin-image CDNs `resolveCoin()` returns (Dexscreener, IPFS
  gateways in use). Anything else is dropped. This is what stops the endpoint
  being an open image proxy.
- **Request downsized copies.** Supabase's image transform
  (`/render/image/public/...?width=240`) for avatars; thumbnails at 1000 wide.
  Keeps the PNG under the ~300 KB WhatsApp comfort zone and the fetch fast.

### Fonts

Copy `Geist-Medium.ttf`, `Geist-SemiBold.ttf`, `Geist-Bold.ttf`,
`GeistPixel-Triangle.ttf` into `og-worker/fonts/`, add a wrangler
`rules: [{ type: "Data", globs: ["**/*.ttf"] }]` and pass them as `fonts` to
`ImageResponse`. ~580 KB bundled, well inside this worker's budget. Geist has
no CJK/Arabic glyphs — see §7.

### Backwards compatibility

The composer still fetches `/api/og/post?text&name&username&avatar` to snapshot
token-launch posts. The new post template accepts a superset of those params,
so that URL keeps working with the old param names and just renders the new
design. Switch the composer to `ogImageUrl()` in Phase 4.

---

## 4. Card design (applies to every template)

Fixed-dark surface — a share card is never themed (memory
`fixed-dark-vs-themed-surfaces`). Rules from `docs/design-principles.md`:

- **Canvas** `rgb(5,5,5)` full-bleed, 1200×630, 64 px padding.
- **Panel** where a template has one: `#0f0f10`-ish fill, radius 40, hairline
  border `rgba(138,145,158,0.2)`, 1 px inset highlight `rgba(255,255,255,0.06)`
  along the top edge. **No gradients. No gray/black drop shadows.** Glow, if
  any, is brand-tinted.
- **Type** Geist. Display line 56–64 px SemiBold, body 32–36 px Medium,
  meta 26 px in `#7F878E` (pastelgray). Wordmark bottom-right in
  `GeistPixel-Triangle` + `public/logo.svg` inlined as a data URI.
- **Colour** accent `#358efc` (twitter2) for the verified mark and the type
  chip; `#00ED89` (lantern) only for a price going up; `#FF746C` (pastelred)
  for down and for the LIVE pill.
- **Chips/pills** `rounded-full`, 44 px tall, `rgba(255,255,255,0.06)` fill,
  hairline border. Stats read "1.2K likes", `compactCount` semantics.
- **Hero variants** put the image on the right 45% with radius 32, text left.
  Images are `objectFit: cover`. Never stretch; never a hover-zoom analogue.
- **Safe area**: keep everything essential inside the centre 1200×600 —
  X crops to ~1.91:1 in some placements and Discord crops the sides on mobile.
- **Type chip** top-left of the panel names the thing: Post · Video · Live ·
  Coin · Market · Community. It is what makes a 200 px-wide preview legible.

### 4a. Two card shapes, chosen per thing

The two references (a YouTube link and a pump.fun coin link, both as they
unfurl on X, screenshots from 2026-09-03) are **different card types**, and
the difference is the point:

- **Compact card** (`twitter:card = summary` or `player`). The platform draws
  a small square image on the left and the page's own title + description as
  text on the right, with the domain above. YouTube uses this. It is the
  right shape for anything whose thumbnail already carries the meaning — a
  **video**, and probably a **live stream** — because the title stays real,
  selectable text and the thumbnail is not squeezed into a second frame with
  more text painted on it. Nothing is rendered by the worker: `og:image` is
  the raw `thumbnailUrl`, `og:title` the video title, `og:description` the
  first line of the post body.
  - The **play glyph** in the reference comes from the `player` card type.
    `twitter:player` wants an HTTPS iframe URL plus width/height, and Next's
    metadata API supports it (`twitter: { card: "player", players: [...] }`).
    We have the shape already: `app/embed/post/[id]` is a public,
    provider-free, framable page. Add **`app/embed/video/[id]`** that renders
    only the IVS/HLS player for a public video, and point the player card at
    it. Nothing in `next.config` or the middleware sets `X-Frame-Options` or
    `frame-ancestors` (checked), so x.com can frame it. Fall back to
    `summary` if X declines to render the player inline; the layout is the
    same either way.
  - Discord, Telegram and iMessage ignore Twitter card types and use the OG
    tags, so the compact shape only affects X. That is fine: on those
    surfaces a raw thumbnail plus title is already the YouTube treatment.
- **Big card** (`twitter:card = summary_large_image`) — the full-width
  generated 1200×630 image. For things whose *numbers* or *identity* are the
  hook and no photo exists: **coin**, **prediction market**, **profile**,
  **community**, and **text posts**. This is what the worker renders.
- **Posts with an image or video** are the borderline. Default: big card with
  the media as hero (the tweet-with-photo look). Revisit after the Phase 5
  matrix if the compact shape reads better for video posts.

### 4b. The coin card, from the pump.fun reference

What the reference does, and how each part maps onto our rules:

| pump.fun | ours |
|---|---|
| Dark panel, large radius, hairline border | Same: canvas `rgb(5,5,5)`, panel radius 40, slate hairline, 1 px inset highlight |
| Blurred coin image washed across the background | **No.** That is a gradient in effect and satori has no `filter` anyway. Flat canvas; the tint comes from a brand-coloured `boxShadow` glow behind the number and the coin tile |
| Name (bold) over ticker (muted) | `name` 56 px SemiBold, `$SYMBOL` 32 px Medium in pastelgray |
| "Market Cap" label, then a huge number with a green glow | Label 30 px Medium; number **120 px Bold** white with a lantern `textShadow` glow (satori supports `textShadow`). Glow colour follows the 24h delta: lantern up, pastelred down, `#358efc` when flat or unknown |
| Green "See more" pill | Lantern pill, dark text, `rounded-full`, 64 px tall at card scale. It is paint, not a button — crawlers do not click — but it tells the viewer the link goes somewhere |
| Coin image as a big rounded square on the right | Same, 300×300, radius 48, on the right edge of the panel; `/logo.svg` tile when the coin has no image |
| pump.fun wordmark + app-store badges below | The badges are X's **app card** (`twitter:app:*`), a separate card type, not part of the image. Wordmark goes inside our image bottom-left in the pixel font. App card: §8 |

Same anatomy, with the number swapped, serves the **prediction market** card
(question as the name line, the leading outcome's implied % as the big
number, pool size as the label) and the **live** card (viewer count as the
number, LIVE pill in pastelred where the ticker line sits). One layout,
three templates, which is what keeps the primitives small.

Satori constraints to design within: flexbox only (every multi-child node
needs explicit `display: flex`), no `line-clamp` (clamp text server-side by
characters and append `…`), no `clip-path` (large radius stands in for the
squircle), element-object tree not HTML strings (the string parser drops
`display: flex`; see the comment at the top of `og-worker/src/index.ts`).

---

## 5. Phases

### Phase 0 — every link gets *a* card — **SHIPPED 2026-09-03**

What landed: `lib/share/metadata.ts` (`shareMetadata` / `fallbackShareMetadata`,
`SITE_URL`, the default image constant), the root layout's `metadataBase` +
`openGraph` + `twitter` blocks, `public/og-default.png` rendered by
`scripts/dev/render-og-default.mjs` (Chrome, fonts inlined), the six existing
pages moved onto the helper (video and category use the raw thumbnail in the
compact `summary` card), `lib/share/parse-meta.ts` + `scripts/dev/check-share-meta.mjs`,
and **`/dev/share-cards`** — a preview page that crawls any list of paths as
Twitterbot and draws the X and Discord unfurls side by side, with a link to
open each image full-size (`?u=/status/abc,/pump`).


1. `app/layout.tsx`: `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL
   ?? "https://watchparty.xyz")`, `openGraph: { siteName: "watchparty",
   type: "website", images: [default] }`, `twitter: { card:
   "summary_large_image" }`.
2. **Default brand image** as a static file at `public/og-default.png`,
   referenced explicitly from the root metadata (not the `opengraph-image`
   file convention — with shallow `openGraph` merging the explicit path is
   the predictable one). Static, not worker-rendered, so the fallback
   survives the worker being down. `*.png` is gitignored repo-wide — the
   `!public/og-default.png` negation is in place (memory `ci-guards-and-png-ignore`).
3. `lib/share/metadata.ts` helper; switch the six existing `generateMetadata`
   to it (still with the default image — templates come later).
4. `scripts/dev/check-share-meta.mjs`: fetches one URL of each type on prod
   with a `Twitterbot/1.0` UA, asserts `og:title`, `og:image` (absolute),
   `twitter:card`, and that the image URL answers `200 image/png` under 1 MB.
   This is the gate; tsc cannot see any of this.

**Done when:** pasting `watchparty.xyz` and a `/status/…` link into Discord
and X both show the brand image, and the script passes.

### Phase 1 — the worker becomes a card platform — **SHIPPED 2026-09-03**

Landed with Phase 2's templates in one pass: fonts bundled (`og-worker/fonts/`,
wrangler `rules` Data module), `src/h.ts` element helper, `src/ui.ts`
primitives, `src/images.ts` (allowlist + 2.5s deadline + Supabase resize +
PNG/JPEG/GIF only — resvg cannot decode WebP, and a WebP body used to fail the
whole card), `src/params.ts` capped readers, and the router with a shared
warm-up promise (two cold concurrent renders double-initialise resvg's wasm
otherwise). Local: `bunx wrangler dev --port 8787` in `og-worker/` + the
`next.config` dev rewrite; **restart it after editing source** (hot reload
leaves the worker dead). Every template is rendered from fixtures on
`/dev/share-cards`.

Three things learned rendering them, now encoded in the primitives:
- **satori lets a flex column grow to its text's width instead of wrapping**,
  pushing the other column off the canvas. Every column has an explicit width
  from `innerWidth()`; never `flexGrow: 1` on a text column.
- **Chips inside a column stretch full-width** — `chip()` sets `alignSelf`.
- **`marginTop: "auto"` does not push** inside a column whose height came from
  content; use a `flexGrow: 1` spacer.


1. Fonts bundled (above). Emoji: enable `workers-og`'s emoji loader so posts
   with emoji don't render tofu.
2. Router: `/api/og/<template>` → template fn; unknown template → 404;
   `v` param read and echoed in an `x-og-template-version` header (debugging).
3. Primitives in `og-worker/src/ui.ts`: `frame()`, `panel()`, `avatar()`,
   `chip()`, `stat()`, `wordmark()`, `hero()`, `clamp(text, n)`.
4. `og-worker/src/images.ts`: allowlisted, deadline-bounded fetch → data URI,
   with the Supabase transform rewrite and the `/avatar.png` fallback.
5. Re-do **post** on the primitives (kills the drop shadow, adds Geist and the
   wordmark). Old param names keep working.
6. `og-worker/local-test.mjs` grows into `scripts/dev/render-og-cards.mjs`:
   renders every template with fixture data through `wrangler dev` to
   `scratch/og/*.png`, asserts PNG magic bytes and 10 KB < size < 1 MB. Run it
   before every og-worker push and eyeball the PNGs — it is the only review a
   card gets.

### Phase 2 — templates — **SHIPPED 2026-09-03** (all eight, incl. PnL both ratios)


Coin first (it is the reference and the template two others reuse) → post
variants (text / image / video / token) → profile + live → prediction →
community + invite → category. Each is one file
`og-worker/src/templates/<name>.ts`, one fixture in the render script, one
typed field set in `lib/share/og-url.ts`.

**Video is not a worker template.** It ships as the compact card (§4a):
`app/embed/video/[id]/page.tsx` (public, provider-free, HLS player only,
`robots: noindex`, added to the `/embed/*` public prefix that already exists)
plus `twitter: { card: "player", players: [{ playerUrl, streamUrl, width:
1280, height: 720 }] }` and the raw thumbnail as `og:image`.

### Phase 3 — wire the pages — **SHIPPED 2026-09-03**

Coin (both the `tokens` row and the `resolveCoin()` shape), profile with the
live variant when the host is broadcasting, post (text / image / video /
launch chosen from the row), market (implied odds from the outcome pools),
and community — the server layout covers every channel page, and a new
invite layout covers the invite link, both because those pages are client
components and cannot export `generateMetadata`. Video stays the compact
card; captionless videos get a "@creator · 0:42 · 1.2K views" byline.
Verified on prod with `check-share-meta.mjs` and `/dev/share-cards`.


- Existing six: build the template URL from the row they already hold.
  Profile picks `live` when `getStreamByUser` says so (it already runs
  server-side for the page). Coin handles both the `tokens` row and the
  `resolveCoin()` shape. Video switches to the compact/player card and drops
  the worker entirely.
- Add `generateMetadata` to `/communities/[serverId]`, `.../channels/[channelId]`
  (server card), `/communities/invite/[code]`.
- Static `metadata` exports on the marketing pages and `/home`.
- Every `generateMetadata` wraps its query in try/catch and falls back to the
  brand card — a DB hiccup must never produce a blank unfurl.

### Phase 4 — in-app share UX (1 day) — **NEXT**

Also queued here: `app/embed/video/[id]` + the X `player` card for videos
(§4a), and the PnL flow (§9).


- `components/browse/post-card/share-menu.tsx`: "Share post via …" is a dead
  row today. Implement `navigator.share` where available, else a sub-menu: X
  intent, Telegram, copy link. Same rows on profile, coin, prediction, and
  community share actions (they share the copy-link pattern already).
- Optional "Copy image": fetch the card PNG and put it on the clipboard.
- Switch the composer's token-launch snapshot to `ogImageUrl("post", …)`.

### Phase 5 — verification and ops (half a day, then ongoing)

- Manual matrix once per template: X (post a DM to self), Discord, Telegram,
  iMessage, Slack, LinkedIn's Post Inspector. Record which crop each applies.
- `check-share-meta.mjs` in `deploy.yml` after `deploy-container`, non-blocking
  at first (it hits prod), blocking once it has been green for a week.
- Cache-bust procedure documented in the worker: bump `v`, deploy, re-share.
  X caches a card per page URL for ~7 days and offers no purge — say so in
  the doc so nobody chases a "stale card" bug.

---

## 6. File map (new + touched)

```
og-worker/
  fonts/*.ttf                       copied from app/fonts (4 files)
  src/index.ts                      router only
  src/ui.ts                         primitives + design tokens
  src/images.ts                     allowlist + deadline fetch + data URI
  src/templates/{post,profile,live,coin,video,market,community,category}.ts
  wrangler.jsonc                    + rules: Data *.ttf
lib/share/og-url.ts                 (exists) ogImage()/ogImagePath(), typed fields per template
lib/share/og-fixtures.ts            (exists) sample data for every card
lib/share/metadata.ts               shareMetadata(...)
app/layout.tsx                      metadataBase, openGraph, twitter
app/opengraph-image.png (+ .gitignore negation)
app/embed/video/[id]/page.tsx       player-card iframe target (public, no providers)
app/(app)/**/page.tsx               the six existing + three community pages
app/(marketing)/**/page.tsx         static metadata
components/browse/post-card/share-menu.tsx
components/browse/post-composer.tsx, components/app-ui/create-dialog.tsx
scripts/dev/check-share-meta.mjs    (exists)
scripts/dev/render-og-default.mjs   (exists) brand default → public/og-default.png
scripts/dev/render-og-cards.mjs
lib/share/parse-meta.ts             (exists) crawler-style tag parser
app/(app)/dev/share-cards/page.tsx  (exists) X + Discord unfurl preview
```

---

## 7. Risks and gotchas

- **Crawlers depend on `PUBLIC_BROWSING`.** Flip it off and every crawler is
  redirected to `/login`, and every card dies with it. Before that flag ever
  changes, `middleware.ts` needs a crawler allowlist (Twitterbot,
  facebookexternalhit, Discordbot, TelegramBot, Slackbot-LinkExpanding,
  LinkedInBot, WhatsApp) that may pass the auth gate on read-only routes.
  Worth adding in Phase 3 regardless — it costs one regex.
- **The zone route is dashboard-owned.** `watchparty.xyz/api/og/*` was added
  by hand because the CI token cannot create routes. If the worker is ever
  renamed, the route goes with it and every card 404s while deploys stay green.
- **Bundle discipline.** Nothing from the app may be imported into the worker
  (no `@/lib/utils`, no React). It has its own lockfile for that reason.
- **Geist has no CJK / Arabic / Devanagari glyphs.** A post in those scripts
  renders tofu. Fix when it shows up: add a Noto Sans subset as a fallback font
  in the `fonts` array (satori falls through by glyph).
- **Open renderer.** Anyone can craft a URL that draws our-branded text. Caps
  on every field plus the image-host allowlist are the mitigation; an HMAC
  would need a secret in a worker that deliberately holds none. Revisit only
  if it is abused.
- **PNG weight.** Hero images are what push a card past 300 KB (WhatsApp
  starts dropping previews around there; X's cap is 5 MB). The downsized
  fetch handles it; the render script's size assertion catches regressions.
- **`generateMetadata` runs a DB query.** It already does on six pages; the
  `cache()` dedupe pattern in those files is mandatory so the page body does
  not query twice. Prod-only DB errors surface as blank unfurls, not 500s —
  which is why the fallback-to-brand path matters.
- **Stale by design.** Platforms cache per page URL. A post edited after it
  was shared keeps its old card on X for a week. Not a bug.
- **No tsc coverage.** The worker is a separate tsconfig, the metadata is
  strings, and crawler behaviour is external. The two scripts are the gate.

---

## 9. PnL card (user-generated, the brag image)

Reference: pump.fun's PnL card as posted on X (screenshot 2026-09-03). It is a
different kind of card from everything above: **not** what a crawler draws
for a page, but an image a user *makes* from their own position and posts
as media, with an optional link that unfurls to the same image.

### Anatomy (from the reference, mapped to our rules)

| pump.fun | ours |
|---|---|
| Green frame around a dark panel, green glow | Frame hairline + brand-tinted glow (`boxShadow`) in **lantern when up, pastelred when down**; no gradients, no blurred backdrop |
| Coin avatar, name, ticker top-left | Same, from `tokens` or `resolveCoin()` |
| Price line across the middle, a "B" marker at the buy, stacked "S +3" sell pills | An SVG `<path>` in the tree (satori renders `svg`/`path`/`circle`); line in lantern with a wider 25%-alpha copy behind it as the glow; markers: **B** chip at first buy, sells grouped into "S +n" chips when they cluster (bucket by x-pixel) |
| `+$33.41K` huge, `↑ 6407%` in a green pill | 128 px Bold signed USD; % pill in lantern/pastelred with dark text |
| `8RbueG's position` + date, with the wallet's pfp | **`<username>'s position`** — never the wallet address (memory `no-wallet-address-display`); avatar from the profile; date = last trade |
| Acquired / Average entry / Market Cap | Same three: cost basis USD; entry **market cap** (avg entry price × supply, supply = mcap ÷ price at render); current mcap |
| pump.fun wordmark + QR code bottom | Pixel wordmark bottom-left; **QR to `/coin/<mint>?ref=<username>`** bottom-right (a tiny QR encoder as SVG rects; doubles as the referral hook) |

### Numbers, from what exists

- `trades` rows for `(userId, mint)` give buys (`outputMint = mint`) and sells
  (`inputMint = mint`) with `usdValue` at fill and raw amounts. `server/lib/pnl.ts`
  already does the avg-cost math per window; the card needs the same math
  **per mint, all-time**, so factor a `positionForMint(userId, mint)` out of it
  rather than a second copy. Realized + unrealized (mark = current price) is
  the headline; % = PnL ÷ cost basis.
- Sells beyond tracked buys have no basis (the library's existing rule) —
  a card for such a position shows realized only and says so in a small chip.
- Price series: `lib/coins/sparkline.ts` / `candles.ts` for the window from
  first buy to now, **quantized to 64 points in 0–99** and packed into one
  URL param (~130 chars). Marker positions are indices into that series.

### Two sizes, one template

- **Portrait 1080×1350** for posting as media (what the reference is — the
  X feed shows it large). Default for download / copy / "Post to X".
- **1200×630** for the `/pnl/[cardId]` unfurl.
Same template, a `ratio` param switches the layout.

### Flow

1. "Share PnL" on the coin page's position panel and on
   `components/profile/profile-pnl-card.tsx` (per-coin rows).
2. `pnl.createCard` (protected): computes the fields, **persists a snapshot**
   in a `pnl_cards` table (`id`, `userId`, `mint`, `fields` json, `createdAt`)
   and returns the id. A brag is a moment: the snapshot is what makes the
   card immutable after posting and the `/pnl/[id]` link unfurl the same
   image next month.
3. Dialog shows the rendered card (`/api/og/pnl?…` built from the snapshot),
   with **Copy image**, **Download**, **Post to X** (intent with text +
   `/pnl/[id]`), and Copy link.
4. `/pnl/[cardId]` page: `generateMetadata` → the 1200×630 render;
   body shows the portrait card with a "Trade $TICKER" CTA. Public by
   construction (the user made it to share); `noindex`.

Sharing is the user's explicit act on their own position, so it does not
depend on the `pnl.setSharing` profile toggle — but a card only ever exposes
what the user chose to post.

### Where it sits in the phases

- Chart + marker + QR primitives → Phase 1 (`og-worker/src/ui.ts`).
- `pnl` template → Phase 2, right after coin (it reuses coin's strip and
  number styles).
- `pnl_cards` table (additive SQL under `db/`), `pnl.createCard`, the dialog
  and `/pnl/[id]` → Phase 4.

---

## 8. Open decisions (defaults chosen; change here, not in code)

- **Square variant?** Telegram and WhatsApp render 1:1 better. Default: no —
  ship 1200×630 everywhere first, add `?ratio=1` to the router later if the
  square crops look bad in the Phase 5 matrix.
- **Follower / like counts on cards.** Default: yes, they are what make a card
  worth clicking, and the URL-encoded value is a snapshot so staleness is
  bounded by the crawler's own cache.
- **Wallet addresses.** Never on a card (memory `no-wallet-address-display`).
  Coin cards show `$SYMBOL` and the chain badge, not the mint.
- **X app card** (the Google Play / App Store badges under the pump.fun
  reference). It is `twitter: { card: "app", app: { id: { iphone } } }` and
  needs a live App Store id, so it waits for the iOS app (memory
  `mobile-app-expo`). When it ships, add it on the **home/marketing** pages
  only — an app card replaces the image card on X, and a coin link should
  still unfurl as the coin, not as a download prompt. Default until then: no.
- **Verified mark.** From `user.verifiedTier` — on a card it is a badge, which
  is exactly what that field is (CLAUDE.md: never *gate* on it; displaying it
  is fine).
