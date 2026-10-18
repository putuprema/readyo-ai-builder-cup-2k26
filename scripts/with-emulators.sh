#!/usr/bin/env bash
# Runs a command inside `firebase emulators:exec` for the demo project.
# Usage: scripts/with-emulators.sh <emulators> <command...>
#   scripts/with-emulators.sh firestore pnpm --filter firestore-tests test:inner
#   scripts/with-emulators.sh firestore,auth pnpm --filter api seed:demo
# The Firestore emulator is a jar, so a Java runtime is needed: PATH first, then the
# Homebrew OpenJDK, then macOS's java_home. The firebase CLI is a root dev dependency.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
emulators="${1:?emulators (e.g. firestore or firestore,auth)}"
shift
[ "$#" -gt 0 ] || { echo "with-emulators: missing command" >&2; exit 1; }

if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  if [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  elif /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home)"
    export JAVA_HOME
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    echo "with-emulators: no Java runtime found. Install one (brew install openjdk) and retry." >&2
    exit 1
  fi
fi

cd "$root"
exec pnpm exec firebase emulators:exec --only "$emulators" --project demo-adidi "$*"
