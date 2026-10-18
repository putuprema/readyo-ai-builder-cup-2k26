#!/usr/bin/env bash
# Build one Cloud Run service with Cloud Build and deploy it.
# Usage, from the repo root:  scripts/deploy-service.sh api|worker
set -euo pipefail

svc="${1:-}"
case "$svc" in
  api|worker) ;;
  *) echo "usage: $0 api|worker" >&2; exit 2 ;;
esac

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"

if [ "$PROJECT_ID" = "YOUR_PROJECT_ID" ]; then
  echo "Set PROJECT_ID in scripts/env.sh first." >&2
  exit 1
fi

sha="$(git -C "$root" rev-parse --short HEAD)"
image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${svc}:${sha}"

echo "Building $image with Cloud Build..."
gcloud builds submit "$root" \
  --project "$PROJECT_ID" \
  --config "$root/$svc/cloudbuild.yaml" \
  --substitutions "_IMAGE=$image"

auth_flag="--no-allow-unauthenticated"
[ "$svc" = api ] && auth_flag="--allow-unauthenticated"

echo "Deploying $svc to Cloud Run in $REGION..."
gcloud run deploy "$svc" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$image" \
  --port 8080 \
  --set-env-vars "GIT_SHA=$sha" \
  "$auth_flag" \
  --quiet

url="$(gcloud run services describe "$svc" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
echo
echo "$svc deployed: $url"
echo "Health: $url/health"
if [ "$svc" = api ]; then
  echo "Put this URL into API_URL in scripts/env.sh before running scripts/deploy-web.sh."
fi
