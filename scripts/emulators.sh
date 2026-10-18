#!/usr/bin/env bash
# Starts the Auth, Firestore and Storage emulators for local development of the whole app
# (web with NEXT_PUBLIC_USE_EMULATORS=1, api and worker with the *_EMULATOR_HOST variables)
# and keeps them running until Ctrl-C. Data is saved to .firebase/emulator-data on exit and
# loaded again on the next start, so the seeded demo account survives restarts.
# Usage: pnpm emulators
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=java-env.sh
source "$root/scripts/java-env.sh"

cd "$root"
data=".firebase/emulator-data"
import=()
[ -d "$data" ] && import=(--import "$data")
exec pnpm exec firebase emulators:start --only auth,firestore,storage --project demo-adidi \
  "${import[@]}" --export-on-exit "$data"
