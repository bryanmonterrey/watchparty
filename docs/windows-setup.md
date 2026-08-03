# Running watchparty on Windows

The repo was developed on macOS. Everything works on Windows, but four things
had to change first — they're already done; this documents what and why.

## What was Mac-only, and what replaced it

**1. The type-check command could not run on Windows.** The documented gate was

```
rm -rf .next/dev/types && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit
```

`rm -rf` doesn't exist in cmd.exe, and `VAR=value command` is a POSIX prefix
PowerShell rejects. It's now:

```
bun run typecheck
```

which runs `scripts/typecheck.mjs` — same two steps through Node APIs, identical
on every OS. Both halves are still load-bearing (see CLAUDE.md): the stale
`.next/dev/types` directory silently suppresses ALL semantic errors, and the
default heap OOMs mid-run while exiting 0.

**2. `bun run build` carried the same env prefix.** Left as-is deliberately —
`bun run` executes scripts through Bun's own cross-platform shell, which
implements both `VAR=value` and `rm`. It works on Windows *when run through bun*.
Run it through PowerShell directly and it won't.

**3. Line endings.** `.gitattributes` now normalises to LF. Without it Git for
Windows checks out CRLF and commits it back, which here would rewrite the ~2,100
vendored TradingView files in `public/charting_library`. Those are marked
`-text -diff` so they're never converted or diffed.

**4. Toolchain drift.** `packageManager: bun@1.3.14` and `engines.node >= 20.9`
are pinned in `package.json` so the second machine doesn't quietly install
something else. `.nvmrc` already said `lts/*`.

## Setup on the new machine

```powershell
# 1. Bun (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# 2. Clone + install
git clone <repo> watchparty
cd watchparty
bun install

# 3. Env — copy .env and .env.production from the Mac. They are gitignored and
#    contain live secrets, so move them over a secure channel, not a repo.

# 4. Verify
bun run typecheck    # empty output = pass
bun dev              # http://localhost:3001
```

Port **3001** is not optional — the OAuth callback URLs and `NEXT_PUBLIC_AUTH_URL`
in `.env` point there.

## Things that will still differ

- **The `.treasury-keys/` directory** is gitignored and machine-local. If you
  sign treasury operations from the Mac, those keys don't travel with the clone;
  see `docs/treasury-security.md`.
- **Deploys are CI-only** (GitHub Actions). Don't try `wrangler` uploads from
  either machine — local uploads EPIPE, which is why CI owns it.
- **The DB is shared and is production.** Both machines point at the same
  Supabase instance; a schema change from the Windows box hits live data exactly
  as it would from the Mac.
- **`bun test`** exists but no suite is wired beyond `tests/`; the type-check is
  still the only real gate.

## Sanity checklist after the move

```
bun run typecheck     # empty output
bun dev               # boots on :3001, /home renders
git status            # clean — if it shows the whole tree modified, .gitattributes
                      # didn't apply; re-clone rather than committing the churn
```
