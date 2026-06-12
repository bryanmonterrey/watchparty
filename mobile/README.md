# Watchparty mobile (iOS)

React Native app built with [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) (React Native 0.85, expo-router, React Compiler), targeting the iOS App Store. It is a **client of the Next.js app one directory up** — same better-auth backend (`/api/auth`) and same tRPC API (`/api/trpc`) with full end-to-end type inference.

## Run it

```bash
# Terminal 1 — the backend (Next.js on :3001)
cd .. && bun dev

# Terminal 2 — the app
bun run ios        # iOS simulator (needs Xcode)
bun start          # or: QR code for Expo Go / dev client on a device
```

Physical devices must be on the same LAN as your Mac — `src/lib/base-url.ts` derives the API host from the Expo dev server, so no config is needed.

Sign-in uses email OTP. With no `RESEND_API_KEY` in the root `.env`, the code is printed to the `bun dev` console.

The start scripts set `EXPO_NO_METRO_LAZY=1`: `@better-auth/expo` does a runtime `import("expo-network")`, and Metro's lazy bundling splits it into a chunk Expo Go fails to load (`Requiring unknown module`). Inlining dynamic imports avoids it — keep the flag if you add start scripts.

## How the type sharing works

`mobile/tsconfig.json` maps `@/*` to `./src/*` **then** `../*` (the repo root). `src/lib/trpc.ts` does:

```ts
import type { AppRouter } from '@/server/routers';
```

`import type` is erased at compile time, so Metro never bundles server code. **Never value-import anything from outside `mobile/`** — Metro will try to bundle Node-only code and fail.

A side effect: `npx tsc --noEmit` here typechecks the entire server router graph, and is *stricter* than the root typecheck (this config resolves better-auth's types where the root config falls back to `any`). If mobile tsc flags server code that root tsc accepts, the mobile one is usually right.

## Structure

```
src/
  app/          expo-router screens (file-based routing, typed routes)
    _layout.tsx   root layout: tRPC + React Query providers, theme
    index.tsx     sign-in (email OTP)
    home.tsx      placeholder home — session + live tRPC query
  components/   shared UI (themed-text/view from the Expo template)
  constants/    theme tokens
  hooks/        use-theme, use-color-scheme
  lib/
    auth-client.ts  better-auth client (@better-auth/expo, SecureStore)
    trpc.ts         typed tRPC hooks (AppRouter type import)
    providers.tsx   QueryClient + tRPC client (forwards the session cookie)
    base-url.ts     dev/prod API origin resolution
```

## Verify changes

```bash
npx tsc --noEmit                  # types (includes the server graph)
bunx expo export --platform ios   # Metro bundle check, no Xcode needed
```

## App Store path (not set up yet)

1. `bunx eas init` — link an Expo account / EAS project (adds `extra.eas.projectId`).
2. `bunx eas build --platform ios` — cloud builds; needs an Apple Developer account ($99/yr). Bundle id is `xyz.watchparty.app` in `app.json`.
3. `bunx eas submit --platform ios` — push to TestFlight / App Store review.
