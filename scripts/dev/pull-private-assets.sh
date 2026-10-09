#!/usr/bin/env bash
# Local counterpart of scripts/ci/overlay-private-assets.sh: pull the private
# asset overlay (licensed packs, runbooks) over this checkout using YOUR GitHub
# access, no deploy key needed. The files land at their real paths and are
# gitignored there, so a later commit can't put them back into the public repo.
#
#   bash scripts/dev/pull-private-assets.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
gh repo clone bryanmonterrey/watchparty-assets "$tmp/assets" -- --quiet --depth 1
( cd "$tmp/assets" && find . -path ./.git -prune -o -type f ! -name README.md -print ) | while IFS= read -r f; do
    mkdir -p "$(dirname "$f")"
    cp "$tmp/assets/$f" "$f"
done
echo "pulled the private assets over $(pwd)"
