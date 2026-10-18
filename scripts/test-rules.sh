#!/usr/bin/env bash
# Runs the Firestore security rules tests against the Firestore emulator.
# Run from the repo root: pnpm --filter firestore-tests test
# Needs Java (the emulator is a jar) and the firebase CLI (root dev dependency).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

# Find a Java runtime: PATH first, then the Homebrew OpenJDK, then macOS's java_home.
if ! command -v java >/dev/null 2>&1 || ! java -version >/dev/null 2>&1; then
  if [ -x /opt/homebrew/opt/openjdk/bin/java ]; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  elif /usr/libexec/java_home >/dev/null 2>&1; then
    export JAVA_HOME="$(/usr/libexec/java_home)"
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    echo "test-rules: no Java runtime found. Install one (brew install openjdk) and retry." >&2
    exit 1
  fi
fi

cd "$root"
exec pnpm exec firebase emulators:exec --only firestore --project demo-adidi \
  "pnpm --filter firestore-tests test:inner"
