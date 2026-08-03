#!/usr/bin/env bash
#
# Encrypt every gitignored secret in this repo into a single archive, for moving
# machines or for offline backup.
#
#     ./scripts/backup-secrets.sh                     # auto-detect a mounted USB
#     ./scripts/backup-secrets.sh "/Volumes/My USB"   # or name the destination
#
# Restore with scripts/restore-secrets.sh, which works in Git Bash on Windows.
#
# WHY ENCRYPTED, always:
#
#   A USB stick is usually FAT32 or exFAT. Neither has permissions or encryption,
#   so a plaintext copy is readable by ANY machine the stick is plugged into, and
#   `chmod 600` on it does nothing at all. This archive holds live database
#   credentials and Solana private keys that control real funds, so the container
#   is the only thing protecting them. Choose a passphrase you'd protect a wallet
#   with, because that is what this is.
#
# WHY openssl rather than 7-Zip/age/gpg: it's already on macOS and it ships with
# Git for Windows, so the archive opens on the new machine with nothing installed.
# AES-256-CBC with PBKDF2 at 600k iterations (the OWASP figure for SHA-256).

set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"

# Explicit list, never a glob: a glob over dotfiles would sweep in whatever
# happens to be lying around, and this archive is meant to be auditable.
SECRETS=(
    .env
    .env.example
    .env.local
    .env.production
    .env.production.local
    .dev.vars
    .cf-secrets.json
    .mcp.json
    .treasury-keys
    .wallet-backups
)

# ---- destination ------------------------------------------------------------

# macOS still ships bash 3.2 (2007), so: no `mapfile`, and an empty array is
# "unset" to `set -u`. Hence the while-read loops and the explicit counters.
dest="${1:-}"
if [ -z "$dest" ]; then
    # Every mounted volume except the boot disk.
    vols=""
    nvols=0
    while IFS= read -r v; do
        [ -n "$v" ] || continue
        vols="$vols$v
"
        nvols=$((nvols + 1))
    done < <(find /Volumes -maxdepth 1 -mindepth 1 ! -name "Macintosh HD" 2>/dev/null || true)

    if [ "$nvols" -eq 1 ]; then
        dest="${vols%$'\n'}"
    elif [ "$nvols" -eq 0 ]; then
        echo "no removable volume mounted — pass the destination explicitly" >&2
        exit 1
    else
        echo "several volumes mounted; pass one explicitly:" >&2
        printf '%s' "$vols" | sed 's/^/  /' >&2
        exit 1
    fi
fi
[ -d "$dest" ] || { echo "no such directory: $dest" >&2; exit 1; }

# ---- gather -----------------------------------------------------------------

present=()
npresent=0
for f in "${SECRETS[@]}"; do
    [ -e "$f" ] || continue
    # A tracked file in here would mean it's already public in git and the
    # encryption is theatre — worth knowing about, so refuse.
    if ! git check-ignore -q "$f"; then
        echo "refusing: $f is NOT gitignored, so it is already in the repo" >&2
        exit 1
    fi
    present[$npresent]="$f"
    npresent=$((npresent + 1))
done
[ "$npresent" -gt 0 ] || { echo "nothing to back up" >&2; exit 1; }

echo "including:"
printf '  %s\n' "${present[@]}"
echo

# ---- passphrase -------------------------------------------------------------

# Read once and reuse for the verify pass, so you type it twice (confirmation)
# rather than four times. Held in a 0600 file in a private temp dir rather than
# an env var or argv, both of which are visible to `ps` for other processes.
umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

read -rsp "passphrase: " pw; echo
read -rsp "again:      " pw2; echo
[ "$pw" = "$pw2" ] || { echo "passphrases differ" >&2; exit 1; }
[ ${#pw} -ge 12 ] || { echo "use at least 12 characters — this unlocks treasury keys" >&2; exit 1; }
printf '%s' "$pw" > "$work/pw"
unset pw pw2

# ---- archive + encrypt ------------------------------------------------------

stamp="$(date +%Y%m%d)"
out="$dest/watchparty-secrets-$stamp.tar.gz.enc"

# Staged in the private temp dir, never written plaintext to the USB even
# briefly — a deleted file on FAT32 is trivially recoverable.
tar -czf "$work/secrets.tar.gz" "${present[@]}"

openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt \
    -in "$work/secrets.tar.gz" -out "$out" -pass "file:$work/pw"

# ---- verify -----------------------------------------------------------------

# Read it back from the USB and list it. Proves the passphrase works and the
# bytes landed intact, which you want to know NOW and not on the other machine.
echo
echo "verifying the archive on the drive..."
listed="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 \
    -in "$out" -pass "file:$work/pw" | tar -tzf - | wc -l | tr -d ' ')"
echo "  ok — $listed entries readable"

sync
echo
echo "wrote $out"
echo "eject the drive before unplugging it (FAT32 writes are buffered)."
