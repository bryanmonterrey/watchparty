#!/usr/bin/env bash
#
# clean-storage.sh — reclaim macOS dev "System Data" that regrows every build.
#
# Targets ONLY regenerable caches (everything here is recreated on demand):
#   • Xcode DerivedData + DeviceSupport
#   • orphaned simulator devices
#   • Metro / Expo / Hermes / Watchman caches
#   • bun / npm / yarn / pnpm package caches
#   • per-project .next / .turbo / .expo build caches
#
# It NEVER touches your source, Downloads, Documents content, node_modules,
# app data (~/Library/Application Support), or toolchains (.rustup/.cargo/.nvm).
#
# Usage:
#   bash scripts/clean-storage.sh            # safe caches only
#   bash scripts/clean-storage.sh --deep     # also: prune non-iOS simulator
#                                            #   runtimes + `brew cleanup`
#                                            #   (these re-download when needed)
#
set -uo pipefail

DEEP=0
[[ "${1:-}" == "--deep" ]] && DEEP=1

vol=/System/Volumes/Data
free_kb() { df -k "$vol" | tail -1 | awk '{print $4}'; }
free_h()  { df -h "$vol" | tail -1 | awk '{print $4}'; }
start=$(free_kb)
echo "Free before: $(free_h)"
echo

step() { echo "→ $1"; }

step "Xcode DerivedData"
rm -rf ~/Library/Developer/Xcode/DerivedData/* 2>/dev/null

step "Xcode DeviceSupport (iOS/tvOS/watchOS — re-created on device connect)"
rm -rf ~/Library/Developer/Xcode/*DeviceSupport/* 2>/dev/null

step "Orphaned simulator devices"
xcrun simctl delete unavailable 2>/dev/null

step "Metro / Expo / Hermes / Watchman caches"
rm -rf ~/.expo/* ~/.hermes/* 2>/dev/null
rm -rf "${TMPDIR:-/tmp}"/metro-* "${TMPDIR:-/tmp}"/haste-map-* "${TMPDIR:-/tmp}"/react-* 2>/dev/null
command -v watchman >/dev/null 2>&1 && watchman watch-del-all >/dev/null 2>&1

step "Package-manager caches (bun / npm / yarn / pnpm)"
command -v bun  >/dev/null 2>&1 && bun pm cache rm >/dev/null 2>&1
command -v npm  >/dev/null 2>&1 && npm cache clean --force >/dev/null 2>&1
command -v yarn >/dev/null 2>&1 && yarn cache clean >/dev/null 2>&1
command -v pnpm >/dev/null 2>&1 && pnpm store prune >/dev/null 2>&1

step "Per-project build caches under ~/Documents/projects (.next/.turbo/.expo)"
find ~/Documents/projects -maxdepth 4 \( -name .next -o -name .turbo -o -name .expo \) -type d -prune 2>/dev/null \
  | while read -r d; do rm -rf "$d" 2>/dev/null; done

if [[ "$DEEP" == "1" ]]; then
  echo
  step "DEEP: prune non-iOS simulator runtimes (tvOS/watchOS/xrOS)"
  xcrun simctl shutdown all 2>/dev/null
  xcrun simctl runtime list -j 2>/dev/null \
    | /usr/bin/python3 -c 'import sys,json;d=json.load(sys.stdin);print("\n".join(k for k,v in d.items() if not v.get("platform","").lower().startswith("ios") and "ios" not in v.get("name","").lower()))' 2>/dev/null \
    | while read -r id; do [ -n "$id" ] && xcrun simctl runtime delete "$id" 2>/dev/null; done

  step "DEEP: brew cleanup"
  command -v brew >/dev/null 2>&1 && brew cleanup -s >/dev/null 2>&1
fi

echo
end=$(free_kb)
echo "Free after:  $(free_h)"
awk -v a="$start" -v b="$end" 'BEGIN{printf "Reclaimed:   %.1f GB\n",(b-a)/1024/1024}'

# Note: /Library/Developer/CoreSimulator/Caches (root-owned dyld caches) can
# hold several GB. To clear it too, run manually:
#   sudo rm -rf /Library/Developer/CoreSimulator/Caches/*
