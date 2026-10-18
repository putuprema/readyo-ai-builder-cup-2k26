#!/usr/bin/env bash
# Puts a Java runtime of version 21 or newer on the PATH for the Firebase emulators (Firestore
# and Storage are jars; firebase-tools refuses older JDKs). Tries the PATH, the Homebrew
# OpenJDK, then macOS's java_home. Sourced by the emulator scripts.

java_major() {
  "$1" -version 2>&1 | sed -nE 's/.*version "([0-9]+).*/\1/p' | head -1
}

java_ok() {
  [ -x "$1" ] || return 1
  local major
  major="$(java_major "$1")"
  [ -n "$major" ] && [ "$major" -ge 21 ]
}

if ! java_ok "$(command -v java 2>/dev/null || true)"; then
  if java_ok /opt/homebrew/opt/openjdk/bin/java; then
    export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
  elif home="$(/usr/libexec/java_home -v 21+ 2>/dev/null)" && java_ok "$home/bin/java"; then
    export JAVA_HOME="$home"
    export PATH="$home/bin:$PATH"
  else
    echo "emulators: no Java 21+ runtime found. Install one (brew install openjdk) and retry." >&2
    exit 1
  fi
fi
