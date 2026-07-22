@AGENTS.md

# Mobile app (`mobile/`)

React Native iOS app — Expo SDK 56, expo-router, React Compiler. Self-contained
package (own `package.json`/lockfile, **excluded from the root tsconfig**); see
`mobile/README.md`. Key invariants:

- It's a client of the Next.js app: tRPC via
  `import type { AppRouter } from "@/server/routers"` (`mobile/tsconfig.json`
  maps `@/*` to `./src/*` then `../*`). **Type-only imports across the
  boundary, never value imports** — Metro would bundle server code.
- Auth reuses `/api/auth` through `@better-auth/expo`: server plugin `expo()`
  registered in `lib/auth/server.ts`, `watchparty://` + `exp://` in
  trustedOrigins, session cookie in SecureStore, forwarded as a `Cookie` header
  on tRPC requests.
- Mobile tsc typechecks the whole server graph and is **stricter than root
  tsc** (it resolves better-auth types the root config silently drops to
  `any`) — trust mobile tsc when they disagree.
- Verify with `cd mobile && npx tsc --noEmit` and
  `bunx expo export --platform ios` (Metro bundle check without Xcode).
