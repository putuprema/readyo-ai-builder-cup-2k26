#!/usr/bin/env bash
# One-time Cloud Tasks setup for the analysis runs (specs/07-pipeline-runs.md). Run after the
# worker is deployed and WORKER_URL is set in scripts/env.sh. Idempotent: existing resources are
# left alone.
#
# Creates the queue, the invoker service account whose OIDC token the tasks carry, lets it
# invoke the worker, and lets the api's runtime account create tasks as that invoker.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"

[ -n "$WORKER_URL" ] || { echo "Set WORKER_URL in scripts/env.sh first (deploy the worker)." >&2; exit 1; }

invoker="${TASKS_SERVICE_ACCOUNT%%@*}"
project_number="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
# The api runs as the default compute service account unless deploy-service.sh says otherwise.
api_sa="${API_SERVICE_ACCOUNT:-${project_number}-compute@developer.gserviceaccount.com}"

echo "Queue $TASKS_QUEUE in $REGION..."
gcloud tasks queues describe "$TASKS_QUEUE" --project "$PROJECT_ID" --location "$REGION" >/dev/null 2>&1 ||
  gcloud tasks queues create "$TASKS_QUEUE" --project "$PROJECT_ID" --location "$REGION" \
    --max-attempts 3 --max-concurrent-dispatches 5 --min-backoff 30s --max-backoff 300s

echo "Invoker service account $TASKS_SERVICE_ACCOUNT..."
gcloud iam service-accounts describe "$TASKS_SERVICE_ACCOUNT" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$invoker" --project "$PROJECT_ID" --display-name "Cloud Tasks invoker for the worker"

echo "Letting the invoker call the worker..."
gcloud run services add-iam-policy-binding worker --project "$PROJECT_ID" --region "$REGION" \
  --member "serviceAccount:$TASKS_SERVICE_ACCOUNT" --role roles/run.invoker --quiet >/dev/null

echo "Letting the api ($api_sa) enqueue tasks as the invoker..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:$api_sa" --role roles/cloudtasks.enqueuer --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$TASKS_SERVICE_ACCOUNT" --project "$PROJECT_ID" \
  --member "serviceAccount:$api_sa" --role roles/iam.serviceAccountUser --quiet >/dev/null

echo
echo "Done. Redeploy the api so it picks up WORKER_URL: scripts/deploy-service.sh api"
