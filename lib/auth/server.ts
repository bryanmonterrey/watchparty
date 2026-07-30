// Auth server: Email OTP · OAuth (Google/X/Twitch/Kick/Discord) · Passkey · 2FA
// Drizzle/Supabase PG · Upstash secondary storage · customSession (canAdmin)
//
// Solana SIWS (better-auth-siws) and EVM SIWE (Base + Hyperliquid) wallet login
// land in M1 with lib/chains — the database hooks below already handle the
// wallet-address path so wiring them back in is additive.

// @ts-ignore - betterAuth is exported but TS's bundler resolution intermittently misses it
import { betterAuth } from "better-auth";
import { dash } from "@better-auth/infra";
import { siwsPlugin } from "better-auth-siws";
import { siwe } from "better-auth/plugins/siwe";
import { withCache, TTL, redis } from "@/lib/cache";
import { verifyEvmMessage } from "@/lib/chains/evm/verify";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { customSession, multiSession, emailOTP, admin, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { expo } from "@better-auth/expo";
import { db } from "@/db";
import { user, session, account, verification, passkey as passkeyTable, walletAddress, linkedWallets } from "@/db/schema/auth";
import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

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
  },
  user: {
    additionalFields: {
      avatar_url: { type: "string" as const, required: false },
      wallet_address: { type: "string" as const, required: false },
      bio: { type: "string" as const, required: false },
      role: { type: "string" as const, defaultValue: "user", input: false },
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
    schema: { user, session, account, verification, passkey: passkeyTable, walletAddress },
  }),

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    generateId: () => crypto.randomUUID(),
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
          const { error } = await resend.emails.send({
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

    dash(),

    nextCookies(), // **LAST** — auto RSC/Server Action cookies
  ],

  // Upsert wallet · last-signed-in · role/wallet security.
  databaseHooks: {
    user: {
      create: {
        before: async (userData: any, ctx: any) => {
          // SIWS sends `address`; EVM SIWE sends `walletAddress`.
          const walletAddress = ctx.body?.address ?? ctx.body?.walletAddress;
          const now = new Date();

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
                // explicit action.
                wallet_address: existingUser.wallet_address ?? walletAddress,
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
              wallet_address: walletAddress,
              role: "user",
              gender: false,
              createdAt: now,
              updatedAt: now,
              last_signed_in: now,
            },
          };
        },
      },
    },

    session: {
      create: {
        before: async (sessionData: any, ctx: any) => {
          if (sessionData.userId) {
            await db
              .update(user)
              .set({ last_signed_in: new Date(), updatedAt: new Date() })
              .where(eq(user.id, sessionData.userId));

            const address = ctx.context?.address ?? ctx.body?.address ?? ctx.body?.walletAddress;

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
            if (
              dbUser.wallet_address &&
              dbUser.wallet_address.toLowerCase() !== String(address).toLowerCase()
            ) {
              throw new APIError("UNAUTHORIZED", { message: "Wallet mismatch" });
            }
          }

          return { data: sessionData };
        },
      },
    },
  },
});
