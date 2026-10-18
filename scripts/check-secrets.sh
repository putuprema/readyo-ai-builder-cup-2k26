#!/usr/bin/env bash
# Fails if anything that looks like a credential is tracked by git.
# Run from the repo root: pnpm check:secrets
set -euo pipefail

patterns=(
  'AIza[0-9A-Za-z_-]{30,}'            # Google API key
  'BEGIN (RSA |EC )?PRIVATE KEY'      # PEM private key
  '"type": *"service_account"'        # service account JSON
  'ya29\.[0-9A-Za-z_-]+'              # OAuth access token
)

found=0
for p in "${patterns[@]}"; do
  if git grep -n -E -e "$p" -- ':!scripts/check-secrets.sh' >/dev/null 2>&1; then
    echo "Possible secret matching /$p/:"
    git grep -n -E -e "$p" -- ':!scripts/check-secrets.sh'
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo "check-secrets: FAILED"
  exit 1
fi
echo "check-secrets: ok, no credentials tracked by git"
