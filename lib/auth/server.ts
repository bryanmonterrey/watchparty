// Auth server: Email OTP · OAuth (Google/X/Twitch/Kick/Discord) · Passkey · 2FA
// Drizzle/Supabase PG · Upstash secondary storage · customSession (canAdmin)
//
// Solana SIWS (better-auth-siws) and EVM SIWE (Base + Hyperliquid) wallet login
// land in M1 with lib/chains — the database hooks below already handle the
// wallet-address path so wiring them back in is additive.

// @ts-ignore - betterAuth is exported but TS's bundler resolution intermittently misses it
import { betterAuth } from "better-auth";
import { clearSlugMiss } from "@/lib/security/slug-miss-cache";
import { dash } from "@better-auth/infra";
import { siwsPlugin } from "better-auth-siws";
import { linkSignInWallet } from "@/lib/wallet/link-signin-wallet";
import { siwe } from "better-auth/plugins/siwe";
import { withCache, TTL, redis } from "@/lib/cache";
import { verifyEvmMessage } from "@/lib/chains/evm/verify";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { customSession, multiSession, emailOTP, admin, twoFactor, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { passkey } from "@better-auth/passkey";
import { expo } from "@better-auth/expo";
import { db } from "@/db";
import {
  user,
  session,
  account,
  verification,
  passkey as passkeyTable,
  walletAddress,
  linkedWallets,
  twoFactor as twoFactorTable,
  oauthClient,
  oauthAccessToken,
  oauthRefreshToken,
  oauthConsent,
  jwks,
} from "@/db/schema/auth";
import { OAUTH_SCOPE_IDS } from "@/lib/developer/oauth-scopes";
import { randHex } from "@/lib/api-gate";
import { and, eq, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

// Resend permanently suppresses an address account-wide after one hard bounce,
// and a send to a suppressed address still returns a normal id with no `error`
// — so the OTP silently vanishes while the UI reports the code was sent. One
// historical bounce (typo'd signup, a mailbox that was full that day, a dead
// work address) therefore locks the account out of email login forever, with
// nothing in the logs. Requesting a login code is an explicit ask for mail, so
// clear any stale suppression first.
//
// Tradeoff: if the address is genuinely dead this re-bounces on each attempt,
// which costs sending reputation. That's bounded by the OTP rate limit, and is
// the better failure than a permanent silent lockout.
async function clearResendSuppression(email: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const headers = { Authorization: `Bearer ${key}` };
  try {
    // NOTE: `?email=` is accepted but NOT honoured — Resend returns the whole
    // list regardless (verified 2026-08-06). It's sent anyway in case that's
    // ever fixed, but the client-side filter below is load-bearing, not a
    // belt-and-braces check: without it this deletes every suppression on the
    // account on every login. Do not "simplify" it away.
    const res = await fetch(
      `https://api.resend.com/suppressions?limit=100&email=${encodeURIComponent(email)}`,
      { headers },
    );
    if (!res.ok) return;
    const body = (await res.json()) as {
      data?: { id: string; email: string }[];
      has_more?: boolean;
    };
    const matches = (body.data ?? []).filter(
      (s) => s.email?.toLowerCase() === email.toLowerCase(),
    );
    if (!matches.length && body.has_more) {
      // Unfiltered list is longer than one page, so the address may be further
      // down and we'd silently fail to clear it. Log rather than paginate the
      // whole account inside a login request.
      console.warn(
        `Resend suppression list exceeds one page; could not confirm ${email} is unsuppressed`,
      );
    }
    for (const s of matches) {
      await fetch(`https://api.resend.com/suppressions/${s.id}`, {
        method: "DELETE",
        headers,
      });
      console.log(`Cleared Resend suppression for ${email} (${s.id})`);
    }
  } catch (err) {
    // Never block a login on cleanup — fall through and attempt the send.
    console.error("Resend suppression cleanup failed:", err);
  }
}

const config = {
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL ?? "http://localhost:3001/api/auth",
  basePath: "/api/auth",
  trustedOrigins: [
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://watchparty.xyz",
    // Ads dashboard subdomain — delegates login here; OAuth callbackURL returns to it.
    "https://ads.watchparty.xyz",
    // Developer console subdomain (console/ app) — same delegation model.
    "https://console.watchparty.xyz",
    // React Native app (mobile/): release scheme + Expo Go dev client.
    "watchparty://",
    "exp://",
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7d
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: true, maxAge: 30 * 60 }, // 30min
    storeSessionInDatabase: true,
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
    storage: "secondary-storage" as const,
    // Defense-in-depth for the OAuth2 IdP endpoints (production only, like
    // the rest of this block). The PRIMARY gate is edge middleware — see
    // middleware.ts, which also 404s /oauth2/register outright.
    customRules: {
      "/oauth2/token": { window: 60, max: 20 },
      "/oauth2/authorize": { window: 60, max: 30 },
      "/oauth2/consent": { window: 60, max: 20 },
      "/oauth2/continue": { window: 60, max: 20 },
      "/oauth2/end-session": { window: 60, max: 30 },
    },
  },
  user: {
    additionalFields: {
      avatar_url: { type: "string" as const, required: false },
      wallet_address: { type: "string" as const, required: false },
      bio: { type: "string" as const, required: false },
      role: { type: "string" as const, defaultValue: "user", input: false },
      // Read-only like `role`: the badge is awarded, never self-assigned. Here
      // so every session payload carries it — including multiSession's device
      // list, which is what lets the account switcher badge each account
      // without a lookup per row. Pairs with hideVerifiedBadge below.
      // fieldName is REQUIRED here and nowhere else in this block. Every other
      // additional field is spelled exactly like its column, so better-auth's
      // default (field name === column name) happens to be right. This one is
      // camelCase in code and snake_case in the DB
      // (db/schema/auth/user.ts: verifiedTierEnum("verified_tier")), so without
      // the mapping better-auth looked for a "verifiedTier" column, found
      // nothing, and silently left it undefined on every session — which is why
      // the badge rendered everywhere that queries the user table directly
      // (posts, feed) but never anywhere reading it from the session.
      verifiedTier: { type: "string" as const, required: false, input: false, fieldName: "verified_tier" },
      username: { type: "string" as const, required: false },
      gender: { type: "boolean" as const, required: false },
      last_signed_in: { type: "date" as const, input: false },
      hideVerifiedBadge: { type: "boolean" as const, defaultValue: false, input: false },
    },
  },
  // Force OAuth state into DB — Redis secondaryStorage loses verification on callback.
  verification: {
    storeInDatabase: true,
  },
};

export const auth = betterAuth({
  ...config,

  // Upstash Redis (sessions + rate limiting). Upstash auto-deserializes JSON, so
  // re-stringify objects to honor the string | null contract secondaryStorage.get expects.
  secondaryStorage: {
    get: async (key: string) => {
      try {
        const val = await redis.get(key);
        if (val === null || val === undefined) return null;
        return typeof val === "string" ? val : JSON.stringify(val);
      } catch {
        return null;
      }
    },
    set: async (key: string, value: string, ttl?: number) => {
      try {
        if (ttl) await redis.set(key, value, { ex: ttl });
        else await redis.set(key, value);
      } catch {
        /* Redis unavailable — ignore */
      }
    },
    delete: async (key: string) => {
      try {
        await redis.del(key);
      } catch {
        /* ignore */
      }
    },
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    // Every model a registered plugin touches MUST be in this map — the
    // adapter resolves config.schema[model] and THROWS on a missing key.
    // (twoFactor was missing here while the plugin was registered; any 2FA
    // row operation would have thrown until it was added.)
    schema: {
      user,
      session,
      account,
      verification,
      passkey: passkeyTable,
      walletAddress,
      twoFactor: twoFactorTable,
      oauthClient,
      oauthAccessToken,
      oauthRefreshToken,
      oauthConsent,
      jwks,
    },
  }),

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    generateId: () => crypto.randomUUID(),
    // Share the session cookie across subdomains. ads.watchparty.xyz has no
    // login of its own — its proxy checks for this cookie and bounces to
    // watchparty's login when missing, so a host-only cookie loops that
    // bounce forever (login sees a session, ads never does). Production only:
    // a ".watchparty.xyz" Domain attribute on localhost is rejected by the
    // browser and would break dev login.
    ...(process.env.NODE_ENV === "production"
      ? { crossSubDomainCookies: { enabled: true, domain: ".watchparty.xyz" } }
      : {}),
  },

  account: {
    // DEV ONLY: mobile dev hits the server via LAN IP but OAuth providers
    // redirect to localhost, so the state cookie planted by the expo
    // authorization proxy is on the wrong host — skip the cookie check
    // there. In production app + callbacks share watchparty.xyz, the proxy
    // cookie matches, and the full check stays ON. State is DB-validated
    // (single-use, expiring) in both cases.
    skipStateCookieCheck: process.env.NODE_ENV !== "production",
    accountLinking: {
      enabled: true,
      trustedProviders: ["kick", "discord"],
      allowDifferentEmails: true,
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      disableDefaultScope: true,
      scope: ["users.read", "tweet.read", "offline.access", "users.email"],
    },
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
    },
    kick: {
      clientId: process.env.KICK_CLIENT_ID!,
      clientSecret: process.env.KICK_CLIENT_SECRET!,
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
  },

  // Plugin order: SIWS → Passkey → Email OTP → Custom → ... → nextCookies LAST.
  plugins: [
    // React Native (mobile/) — cookie handling for the Expo auth client.
    expo(),

    // Solana wallet sign-in (Sign-In With Solana).
    siwsPlugin({
      domain: process.env.NEXT_PUBLIC_AUTH_DOMAIN ?? "localhost",
      statement: "Sign in with Solana to the app.",
      nonceTtlSeconds: 300,
    }),

    // EVM wallet sign-in (Sign-In With Ethereum) — Base + Hyperliquid.
    // NOTE: requires the `walletAddress` table (db/schema/auth/wallet-address.ts)
    // to exist in the DB before it functions live.
    siwe({
      domain: process.env.NEXT_PUBLIC_AUTH_DOMAIN ?? "localhost",
      getNonce: async () => {
        const nonce = crypto.randomUUID().replace(/-/g, "");
        console.log("[siwe] nonce issued");
        return nonce;
      },
      verifyMessage: async ({ message, signature, address, chainId }) => {
        console.log("[siwe] verify called", { address, chainId, msgLen: message?.length, sigLen: signature?.length });
        const ok = await verifyEvmMessage({ message, signature, address, chainId });
        console.log("[siwe] verify result", { address, chainId, verified: ok });
        return ok;
      },
    }),

    passkey({
      rpID: process.env.NEXT_PUBLIC_AUTH_DOMAIN ?? "localhost",
      rpName: process.env.NEXT_PUBLIC_APP_NAME ?? "Watchparty",
      origin: process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001",
    }),

    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        if (process.env.RESEND_API_KEY) {
          await clearResendSuppression(email);
          const { data, error } = await resend.emails.send({
            from: "Watchparty <login@watchparty.xyz>",
            to: email,
            subject: "Your sign in code",
            html: `<div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 24px; max-width: 420px; margin: 0 auto;">
                <h2 style="margin: 0 0 8px;">Welcome back</h2>
                <p style="color: #52525b; margin: 0 0 16px;">Your one-time sign in code is:</p>
                <div style="background: #f4f4f5; padding: 16px; border-radius: 12px; text-align: center;">
                  <span style="font-size: 28px; font-weight: 700; letter-spacing: 8px;">${otp}</span>
                </div>
                <p style="color: #71717a; font-size: 13px; margin: 16px 0 0;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
              </div>`,
          });
          if (error) {
            console.error("Resend error:", JSON.stringify(error));
            throw new Error(`OTP email failed: ${error.message}`);
          }
          // A suppressed send looks identical to a successful one here, so log
          // the id — it's the only handle for tracing "I never got the code".
          console.log(`OTP email queued for ${email}: ${data?.id}`);
        } else {
          // Dev fallback when no Resend key is configured.
          console.log(`\n\n[DEV] OTP code for ${email}: ${otp}\n\n`);
        }
      },
    }),

    // Custom session: hydrate fresh profile fields + canAdmin from DB (cached).
    customSession(async ({ user: sessionUser, session }) => {
      const userData = await withCache(
        `user:profile:${sessionUser.id}`,
        TTL.USER_PROFILE,
        async () => {
          const [freshUserData] = await db
            .select()
            .from(user)
            .where(eq(user.id, sessionUser.id))
            .limit(1);
          return freshUserData || sessionUser;
        },
      );

      return {
        user: {
          ...sessionUser,
          wallet_address: (userData as typeof user.$inferSelect).wallet_address,
          username: (userData as typeof user.$inferSelect).username,
          name: userData.name,
          bio: (userData as typeof user.$inferSelect).bio,
          avatar_url: (userData as typeof user.$inferSelect).avatar_url,
          role: (userData as typeof user.$inferSelect).role,
          canAdmin: (userData as typeof user.$inferSelect).role === "admin",
        },
        session,
      };
    }),

    // X-style multiple signed-in accounts per device. The plugin's after-hook
    // matches EVERY endpoint that mints a session, so OTP, OAuth, SIWS and
    // passkey sign-ins all register themselves — no per-flow work.
    //
    // Past the cap the hook silently declines to add the cookie: the sign-in
    // still succeeds and becomes active, it just never appears in the switcher.
    // The switcher warns before that happens (components/auth/account-switcher).
    multiSession({ maximumSessions: 10 }),

    twoFactor({
      totpOptions: { period: 30, digits: 6 },
      backupCodes: { amount: 10, length: 10 },
      skipVerificationOnEnable: false,
    }),

    admin(),

    // Signs OIDC id_tokens (EdDSA, served at /api/auth/jwks). REQUIRED by the
    // oauth-provider config below (disableJwtPlugin defaults false and stays
    // that way — the HS256 fallback would sign id_tokens with the client
    // secret). Side effect: adds /api/auth/token (session-JWT mint for the
    // current session holder); benign, documented in docs/oauth-provider.md.
    jwt(),

    // OAuth2/OIDC identity provider — "Sign in with watchparty".
    // @better-auth/oauth-provider (migrated 2026-08-12 from the deprecated
    // in-tree oidcProvider — the better-call geometry blocker dissolved once
    // overrides forced a single 1.4.0 tree-wide). What the new plugin fixed
    // upstream, source-verified: PKCE is structural (S256-only, required
    // unless a client row explicitly opts out — the lying `requirePKCE`
    // option is gone), refresh rotation is atomic with family invalidation
    // on replay (lib/auth/oauth-token-rotation.ts deleted), `disabled` is
    // real revocation, and tokens/secrets are stored hashed. See
    // docs/oauth-provider.md.
    oauthProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: false,
      scopes: OAUTH_SCOPE_IDS,
      accessTokenExpiresIn: 3600,
      // Keep the old 7d refresh window (plugin default is 30d).
      refreshTokenExpiresIn: 60 * 60 * 24 * 7,
      // base64url(sha256) at rest — replaces the sealed AES-GCM storage.
      // NOT the encrypt/decrypt form: that THROWS at construction while the
      // jwt plugin is registered (verified 1.6.27 dist).
      storeClientSecret: "hashed",
      // Client rows are created by developerApps.createOAuthClient (direct
      // insert — that's how wpcl_ ids, the 25-app cap and redirect policy
      // survive), but set the generator anyway so any plugin-side creation
      // path mints the same shape.
      generateClientId: () => `wpcl_${randHex(12)}`,
      // Secret-scanner-identifiable token prefixes. Safe to set at cutover
      // because every pre-migration token dies with the plaintext→hashed
      // storage switch. prefix.clientSecret is deliberately ABSENT: existing
      // client secrets were issued bare and survive via rehash — a prefix
      // would fail-closed every one of them at the token endpoint.
      prefix: { opaqueAccessToken: "wpat_", refreshToken: "wprt_" },
      // The warnings ask for root-level /.well-known mirrors; RPs are
      // documented against /api/auth/.well-known/* (docs/oauth-provider.md).
      silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
      // The plugin's own client CRUD (/oauth2/create-client|update-client|
      // delete-client|client/rotate-secret) is only session-gated — it would
      // bypass developerApps' ownership/cap/redirect policy. Middleware 404s
      // those paths at the edge; this is the belt-and-braces layer.
      clientPrivileges: ({ action }) => action === "read" || action === "list",
      // userinfo extras. The callback's output is merged unconditionally
      // (only the BASE claims are scope-filtered upstream), so the profile
      // guard here is still load-bearing.
      customUserInfoClaims: ({ user: claimUser, scopes }) => {
        if (!scopes.includes("profile")) return {};
        return {
          username: (claimUser.username as string | null) ?? null,
          picture: (claimUser.avatar_url as string | null) ?? claimUser.image ?? null,
          verified: Boolean(claimUser.verifiedTier) && !claimUser.hideVerifiedBadge,
        };
      },
      customIdTokenClaims: ({ user: claimUser, scopes }) => {
        if (!scopes.includes("profile")) return {};
        return {
          username: (claimUser.username as string | null) ?? null,
          picture: (claimUser.avatar_url as string | null) ?? claimUser.image ?? null,
          verified: Boolean(claimUser.verifiedTier) && !claimUser.hideVerifiedBadge,
        };
      },
    }),

    dash(),

    nextCookies(), // **LAST** — auto RSC/Server Action cookies
  ],

  // Upsert wallet · last-signed-in · role/wallet security.
  databaseHooks: {
    user: {
      create: {
        before: async (userData: any, ctx: any) => {
          // SIWS sends `address`; EVM SIWE sends `walletAddress`.
          //
          // `ctx?.` — the hook also fires for users created OUTSIDE an HTTP
          // request (internalAdapter.createUser from a script, a seed, a
          // migration), where better-auth passes no context at all. Without the
          // optional chain that path throws "null is not an object" before any
          // user can be made; surfaced by scripts/dev/mint-test-session.mjs.
          const walletAddress = ctx?.body?.address ?? ctx?.body?.walletAddress;
          const now = new Date();

          // An EVM (SIWE) address must never be written to `user.wallet_address`.
          // That column is the SOLANA primary-wallet mirror, and its ~130 readers
          // feed it straight into base58/PublicKey paths — a 0x… there doesn't
          // degrade gracefully, it throws. better-auth's own `walletAddress`
          // table already persists the EVM address (and the session hook below
          // matches sign-ins against it), so leaving the mirror null costs
          // nothing: a Base user is just a user with no Solana wallet yet,
          // exactly like an email or OAuth signup.
          const isEvmWallet = typeof walletAddress === "string" && /^0x[0-9a-fA-F]{40}$/.test(walletAddress);
          // better-auth's siwe plugin seeds `name` with the FULL 0x address,
          // which would then render as a display name app-wide. Truncate it to
          // match what better-auth-siws does for Solana (`sol:AbCd…WxYz`).
          const evmDisplayName = isEvmWallet
            ? `evm:${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
            : undefined;

          const isPasskeyOrEmailAuth = !walletAddress && userData.email;

          if (isPasskeyOrEmailAuth) {
            return {
              data: {
                ...userData,
                id: crypto.randomUUID(),
                wallet_address: null,
                role: "user",
                gender: false,
                createdAt: now,
                updatedAt: now,
                last_signed_in: now,
              },
            };
          }

          if (!walletAddress) {
            throw new APIError("BAD_REQUEST", { message: "No wallet address provided" });
          }

          // Existing wallet → upsert (wallet = single user).
          //
          // Match on linked_wallets FIRST. Once a user has an embedded Swig
          // wallet, their `user.wallet_address` is the Swig address, so an
          // extension they signed in with lives only in linked_wallets —
          // matching on the column alone would fail to recognise them and
          // create a duplicate account. The column lookup remains as a
          // fallback for rows not yet backfilled.
          const [linked] = await db
            .select({ userId: linkedWallets.user_id })
            .from(linkedWallets)
            .where(eq(linkedWallets.address, walletAddress))
            .limit(1);

          const [existingUser] = linked
            ? await db.select().from(user).where(eq(user.id, linked.userId)).limit(1)
            : await db.select().from(user).where(eq(user.wallet_address, walletAddress)).limit(1);

          if (existingUser) {
            return {
              data: {
                ...userData,
                id: existingUser.id,
                // Keep their chosen primary. Signing in with a linked wallet
                // should not silently promote it — switching primary is an
                // explicit action. The EVM guard also covers the fallback: an
                // account whose primary is still null must not have it filled
                // in with a 0x address.
                wallet_address: existingUser.wallet_address ?? (isEvmWallet ? null : walletAddress),
                role: existingUser.role ?? "user",
                gender: existingUser.gender ?? false,
                updatedAt: now,
                last_signed_in: now,
              },
            };
          }

          return {
            data: {
              ...userData,
              id: crypto.randomUUID(),
              name: evmDisplayName ?? userData.name,
              wallet_address: isEvmWallet ? null : walletAddress,
              role: "user",
              gender: false,
              createdAt: now,
              updatedAt: now,
              last_signed_in: now,
            },
          };
        },
      },

      // A slug that 404'd is remembered by `lib/security/slug-miss-cache.ts` so
      // middleware can answer a real 404 instead of a full soft-404 render.
      // That cache would otherwise keep 404ing a handle for up to its TTL after
      // someone actually CLAIMS it — the one case where the negative cache can
      // be wrong. Usernames are written through this adapter rather than a tRPC
      // mutation, so this hook is the single call site that sees every claim.
      update: {
        after: async (updatedUser: any) => {
          const username = updatedUser?.username;
          if (typeof username === "string" && username) {
            // Best-effort: never let cache bookkeeping fail a profile update.
            await clearSlugMiss(username).catch(() => {});
          }
        },
      },
    },

    session: {
      create: {
        before: async (sessionData: any, ctx: any) => {
          if (sessionData.userId) {
            const [updated] = await db
              .update(user)
              .set({ last_signed_in: new Date(), updatedAt: new Date() })
              .where(eq(user.id, sessionData.userId))
              .returning({ isBot: user.isBot });

            // Bot accounts authenticate ONLY via their `Bot <token>` on the API
            // (server/trpc.ts) and must never hold a browser session. The bot's
            // user row carries emailVerified:true and a deterministic address, and
            // emailOTP here is passwordless — so without this refusal, guessing the
            // synthetic bot email could mint an OTP session AS the bot. Throwing in
            // the session-create hook closes EVERY login path (OTP/OAuth/wallet) at
            // once, instead of relying on the bots-subdomain mailbox never
            // delivering. Reuses the update above, so it costs no extra query.
            if (updated?.isBot) {
              throw new APIError("UNAUTHORIZED", { message: "Invalid user" });
            }

            // `ctx?.` for the same reason as the user-create hook above: a
            // session made outside an HTTP request (scripts, seeds) gets no
            // context, and an unguarded deref throws before the session exists.
            const address = ctx?.context?.address ?? ctx?.body?.address ?? ctx?.body?.walletAddress;

            if (!address) {
              return { data: sessionData };
            }

            const [dbUser] = await db
              .select({ role: user.role, wallet_address: user.wallet_address })
              .from(user)
              .where(eq(user.id, sessionData.userId));

            console.log("[siwe] session hook", {
              userId: sessionData.userId,
              address,
              dbWallet: dbUser?.wallet_address,
              role: dbUser?.role,
            });

            if (!dbUser || !["admin", "user"].includes(dbUser.role ?? "")) {
              throw new APIError("UNAUTHORIZED", { message: "Invalid user" });
            }

            // Compare case-insensitively: EVM addresses are case-insensitive
            // (checksummed vs lowercase), so a strict !== falsely rejects them.
            //
            // `user.wallet_address` only mirrors the PRIMARY wallet, so matching
            // it is sufficient but NOT necessary. An account may hold up to 15
            // linked Solana wallets (`linked_wallets`) plus external EVM ones
            // (better-auth's `walletAddress`), and signing in with any of them
            // is legitimate — the whole point of the feature.
            //
            // Enforcing equality with the single primary column is what broke
            // extension sign-in: the wallet resolves to the right account, then
            // gets rejected as "Wallet mismatch" for not being the primary. The
            // check has to ask "is this wallet THIS USER'S", not "is this wallet
            // the one we happen to mirror".
            if (
              dbUser.wallet_address &&
              dbUser.wallet_address.toLowerCase() !== String(address).toLowerCase()
            ) {
              const signer = String(address);
              // Only on the miss, so the common primary-wallet login still
              // costs nothing extra.
              const [linkedSol] = await db
                .select({ id: linkedWallets.id })
                .from(linkedWallets)
                .where(
                  and(
                    eq(linkedWallets.user_id, sessionData.userId),
                    // Exact, not lowercased: base58 is case-SENSITIVE, and
                    // folding case here would let a different valid address
                    // authenticate as this one.
                    eq(linkedWallets.address, signer),
                  ),
                )
                .limit(1);

              const [linkedEvm] = linkedSol
                ? [undefined]
                : await db
                    .select({ id: walletAddress.id })
                    .from(walletAddress)
                    .where(
                      and(
                        eq(walletAddress.userId, sessionData.userId),
                        // Lowercased HERE only: EVM addresses are hex and
                        // case-insensitive, so a checksummed signer must still
                        // match a stored lowercase row.
                        sql`lower(${walletAddress.address}) = ${signer.toLowerCase()}`,
                      ),
                    )
                    .limit(1);

              if (!linkedSol && !linkedEvm) {
                throw new APIError("UNAUTHORIZED", { message: "Wallet mismatch" });
              }
            }

            // The wallet they just signed in with is one of their wallets, and
            // if it is their only one it is the wallet in use. Runs after the
            // ownership checks above so a mismatched wallet is never recorded,
            // and is best-effort inside — bookkeeping must not fail a sign-in.
            // The SIWE body carries the chainId the message was signed on
            // (8453 = Base). Nothing about the address can recover it later, so
            // it is captured here or not at all.
            const signInChainId = Number(
              (ctx?.body as { chainId?: unknown } | undefined)?.chainId ??
                (ctx?.context as { chainId?: unknown } | undefined)?.chainId,
            );
            await linkSignInWallet(
              sessionData.userId,
              String(address),
              Number.isFinite(signInChainId) && signInChainId > 0 ? signInChainId : null,
            );
          }

          return { data: sessionData };
        },
      },
    },
  },
});
