#!/usr/bin/env bash
# Build the web app as a static export and deploy it to Firebase Hosting.
# Usage, from the repo root:  scripts/deploy-web.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"

if [ "$PROJECT_ID" = "YOUR_PROJECT_ID" ]; then
  echo "Set PROJECT_ID in scripts/env.sh and .firebaserc first." >&2
  exit 1
fi
case "$API_URL" in
  *XXXXXXXXXX*) echo "Set API_URL in scripts/env.sh to the deployed api URL (scripts/deploy-service.sh api prints it)." >&2; exit 1 ;;
esac

echo "Building web with NEXT_PUBLIC_API_URL=$API_URL ..."
(cd "$root" && NEXT_PUBLIC_API_URL="$API_URL" pnpm --filter @adidi/shared build && NEXT_PUBLIC_API_URL="$API_URL" pnpm --filter web build)

echo "Deploying to Firebase Hosting ($PROJECT_ID)..."
(cd "$root" && firebase deploy --only hosting --project "$PROJECT_ID")
