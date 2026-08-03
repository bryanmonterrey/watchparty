#!/usr/bin/env bash
#
# Unpack an archive made by scripts/backup-secrets.sh into a fresh clone.
#
#   macOS/Linux:  ./scripts/restore-secrets.sh "/Volumes/Memorex USB/watchparty-secrets-20260802.tar.gz.enc"
#   Windows:      open Git Bash in the repo, then
#                 ./scripts/restore-secrets.sh "/d/watchparty-secrets-20260802.tar.gz.enc"
#
# Git Bash ships openssl and tar, so nothing needs installing. Check with
# `openssl version`; if it's missing, install 7-Zip and use the note in
# docs/windows-setup.md instead.
#
# Refuses to clobber: if a secret file already exists it stops and tells you,
# rather than overwriting a .env you'd edited on this machine.

set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

archive="${1:-}"
[ -n "$archive" ] || { echo "usage: $0 <path-to-.tar.gz.enc>" >&2; exit 1; }
[ -f "$archive" ] || { echo "no such file: $archive" >&2; exit 1; }

umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

read -rsp "passphrase: " pw; echo
printf '%s' "$pw" > "$work/pw"
unset pw

openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
    -in "$archive" -out "$work/secrets.tar.gz" -pass "file:$work/pw" \
    || { echo "could not decrypt — wrong passphrase, or the file is damaged" >&2; exit 1; }

# Look before overwriting. (Plain string accumulation rather than an array:
# macOS bash 3.2 treats an empty array as unset, which `set -u` then kills.)
conflicts=""
while IFS= read -r entry; do
    entry="${entry%/}"
    case "$entry" in */*) continue ;; esac   # only test top-level entries
    if [ -e "$entry" ]; then
        conflicts="$conflicts  $entry
"
    fi
done < <(tar -tzf "$work/secrets.tar.gz")

if [ -n "$conflicts" ]; then
    echo "these already exist here — move or delete them first:" >&2
    printf '%s' "$conflicts" >&2
    exit 1
fi

tar -xzf "$work/secrets.tar.gz" -C "$repo"

# FAT32 carried no permissions, so re-apply them on the way in.
chmod 600 .env* .dev.vars .cf-secrets.json .mcp.json 2>/dev/null || true
chmod -R 700 .treasury-keys .wallet-backups 2>/dev/null || true

echo "restored into $repo:"
tar -tzf "$work/secrets.tar.gz" | sed 's/^/  /'
