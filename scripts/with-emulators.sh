#!/usr/bin/env bash
# Runs a command inside `firebase emulators:exec` for the demo project.
# Usage: scripts/with-emulators.sh <emulators> <command...>
#   scripts/with-emulators.sh firestore pnpm --filter firestore-tests test:inner
#   scripts/with-emulators.sh firestore,auth pnpm --filter api seed:demo
# The firebase CLI is a root dev dependency; Java comes from scripts/java-env.sh.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
emulators="${1:?emulators (e.g. firestore or firestore,auth)}"
shift
[ "$#" -gt 0 ] || { echo "with-emulators: missing command" >&2; exit 1; }

# shellcheck source=java-env.sh
source "$root/scripts/java-env.sh"

cd "$root"
exec pnpm exec firebase emulators:exec --only "$emulators" --project demo-adidi "$*"
