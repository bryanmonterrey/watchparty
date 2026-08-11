# Segments that get their own dedicated chats

Some parts of the platform roadmap are **too large or too security-sensitive to
land as an incremental slice inside a general build session.** Attempting them
mid-stream — between UI passes and small features — is how an auth surface ships
with a subtle hole or an infra decision gets made by accident.

Each segment below is **deferred to its own dedicated chat/session**: one focused
scope, its own design pass, its own threat model, its own verification. This file
is the standing list so the decision isn't re-litigated every session. When one
of these comes up, open a fresh chat for it rather than folding it into whatever
else is in flight.

See `docs/platform-roadmap.md` for where each sits in the overall arc.

---

## 1. OAuth2 "Sign in with watchparty" + public app directory (Phase 11 remainder)

**Why dedicated.** This is a **third-party identity-provider surface**:
`/authorize` + `/token`, a consent screen, client registration/secrets, redirect-
URI allow-listing, PKCE, and a scopes model that outside apps are trusted
against. It sits directly on top of the better-auth stack, which `CLAUDE.md`
documents as version-fragile (the better-call type-identity saga). A mistake here
leaks *other users'* accounts to third-party apps, not just our own data — the
blast radius is categorically larger than anything in Phases 8–10.

**What the dedicated chat covers.**
- Evaluate better-auth's OIDC/OAuth-provider plugin vs. hand-rolling — and whether
  adopting it disturbs the pinned better-call/kysely versions.
- The consent + scope-grant model (reuse the API scope families in
  `lib/api-pricing.ts`? or a distinct OAuth scope set?).
- Client registration, redirect-URI validation, secret rotation.
- The public **app directory** / "Connect with watchparty" listing — gated on the
  verification checklist (Phase 11, **shipped**: `computeVerification` +
  `developerApps.verificationChecklist`/`verificationSummary`).
- A full threat model + real end-to-end auth-flow smoke before it's exposed.

**Already in place as the hook.** `developer_apps.flags` (bitfield, reserved) and
the shipped verification checklist are the gate a listed/OAuth app must clear.

---

## 2. Realtime WebSocket / SSE push transport (Phase 9 remainder)

**Why dedicated.** The filtered-stream **pull** transport is shipped and live
(`developer_stream_deliveries` + `GET /api/stream/events`, cursor-based). The
**push** transport (a live socket) is not a small add — it's the shared
chat/video realtime layer (PartyKit / Cloudflare Durable Objects) that the
`realtime-video-architecture-direction` memory explicitly reserved for its own
scoping. Standing up a bespoke Durable Object just for the developer stream would
be infra we'd rip out when the unified layer lands.

**What the dedicated chat covers.**
- First: **does the CF container runtime (`watchparty-app`) already hold
  long-lived connections?** If so, SSE on top of the existing queue may not need
  a DO at all.
- The shared realtime layer design (chat + communities + video + developer
  stream, one layer), riding the existing `developer_stream_deliveries` queue.
- Connection accounting for the console Connections page, hibernation/backpressure,
  auth on the socket, reconnect/resume semantics.
- Per-rule cost controls beyond the account-bounded default price.

---

## 3. Bot write-capabilities into communities (Phase 8 remainder)

**Why dedicated.** The bot **auth + install + permission** model is shipped and
twice adversarially reviewed. The remaining capabilities — `SEND_MESSAGES`,
`MODERATE`, `MANAGE_COIN_ALERTS` — each touch the **community message/moderation
write path**, which is the parallel chat session's active surface. Adding them
needs coordination with that work (not a blind edit into shared files) plus a
per-capability abuse review, so they belong in a session scoped alongside the
community code.

**What the dedicated chat covers.**
- One `botProcedure` per capability, each enforcing the community permission
  bitfield (`requireInstallPermission`), added without colliding with the
  community composer work.
- The community-side **Bots management UI** in Server Settings → Integrations
  (the revocation endpoints — `communityBots`/`communityUninstall`/
  `communitySetPermissions` — are shipped; the UI that calls them is not).
- Rate/abuse controls for a bot posting into communities.
