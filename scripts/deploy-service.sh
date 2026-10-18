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

# Environment per service (spec 07): the api needs the worker URL and the queue to enqueue runs;
# the worker checks the OIDC audience and may take minutes per run. Both read the Gemini key
# from Secret Manager. WORKER_URL is empty on the very first deploy; redeploy the api once the
# worker URL is known.
# Both services use the default bucket: the api signs upload URLs into it (spec 10), the
# worker reads and deletes the files (spec 04).
env_vars="GIT_SHA=$sha,STORAGE_BUCKET=${STORAGE_BUCKET:-$PROJECT_ID.firebasestorage.app}"
extra_flags=()
if [ "$svc" = api ]; then
  env_vars="$env_vars,TASKS_QUEUE=$TASKS_QUEUE,TASKS_LOCATION=$REGION,TASKS_SERVICE_ACCOUNT=$TASKS_SERVICE_ACCOUNT"
  [ -n "$WORKER_URL" ] && env_vars="$env_vars,WORKER_URL=$WORKER_URL"
else
  env_vars="$env_vars,TASKS_SERVICE_ACCOUNT=$TASKS_SERVICE_ACCOUNT"
  [ -n "$WORKER_URL" ] && env_vars="$env_vars,TASKS_AUDIENCE=$WORKER_URL"
  extra_flags+=(--timeout 1800)
fi

echo "Deploying $svc to Cloud Run in $REGION..."
gcloud run deploy "$svc" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$image" \
  --port 8080 \
  --set-env-vars "$env_vars" \
  --set-secrets "GEMINI_API_KEY=$GEMINI_SECRET:latest" \
  "${extra_flags[@]}" \
  "$auth_flag" \
  --quiet

url="$(gcloud run services describe "$svc" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"
echo
echo "$svc deployed: $url"
echo "Health: $url/health"
if [ "$svc" = api ]; then
  echo "Put this URL into API_URL in scripts/env.sh before running scripts/deploy-web.sh."
else
  echo "Put this URL into WORKER_URL in scripts/env.sh, run scripts/setup-tasks.sh once, then redeploy the api."
fi
