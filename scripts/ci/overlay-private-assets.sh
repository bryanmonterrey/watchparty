#!/usr/bin/env bash
# Lay the private asset overlay over this checkout before a build.
#
# The public repo (AGPL, since 2026-10-09) cannot carry the purchased icon /
# badge packs or the emoji.gg packs — their licences forbid redistribution —
# nor the ops runbooks. They live in the PRIVATE repo
# bryanmonterrey/watchparty-assets, laid out at the same paths they occupy here,
# and this copies that tree over the checkout. Run in CI after checkout (the
# deploy workflows) and locally via scripts/dev/pull-private-assets.sh.
#
# Auth: a read-only deploy key on the assets repo, held as the ASSETS_DEPLOY_KEY
# secret. Nothing here needs write access anywhere.
set -euo pipefail

ASSETS_REPO="${ASSETS_REPO:-git@github.com:bryanmonterrey/watchparty-assets.git}"
ROOT="${ROOT:-$(pwd)}"

if [ -z "${ASSETS_DEPLOY_KEY:-}" ]; then
    echo "overlay-private-assets: ASSETS_DEPLOY_KEY is not set — building WITHOUT the private assets (emotes, badge art will be missing)" >&2
    exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
printf '%s\n' "$ASSETS_DEPLOY_KEY" > "$tmp/key"
chmod 600 "$tmp/key"
ssh-keyscan -t ed25519 github.com > "$tmp/known_hosts" 2>/dev/null

GIT_SSH_COMMAND="ssh -i $tmp/key -o UserKnownHostsFile=$tmp/known_hosts -o IdentitiesOnly=yes" \
    git clone --quiet --depth 1 "$ASSETS_REPO" "$tmp/assets"

# Everything except the overlay repo's own metadata. cp -R keeps subdirectories
# that already exist here (public/, docs/, components/) and adds the files.
( cd "$tmp/assets" && find . -path ./.git -prune -o -type f ! -name README.md -print ) | while IFS= read -r f; do
    mkdir -p "$ROOT/$(dirname "$f")"
    cp "$tmp/assets/$f" "$ROOT/$f"
done

count="$(cd "$tmp/assets" && find . -path ./.git -prune -o -type f ! -name README.md -print | wc -l | tr -d ' ')"
echo "overlay-private-assets: applied $count files from watchparty-assets"
