#!/usr/bin/env bash
# One place for the deploy settings. Sourced by the deploy scripts.
# Fill these in once the GCP project exists.

export PROJECT_ID="${PROJECT_ID:-adidi-ai-cup-builder-2026}"
export REGION="${REGION:-asia-southeast1}"          # Signapore
export AR_REPO="${AR_REPO:-adidi}"                   # Artifact Registry repository name

# Public URL of the deployed api service. Printed by scripts/deploy-service.sh api.
# The web build bakes it in as NEXT_PUBLIC_API_URL.
export API_URL="${API_URL:-https://api-e24frmx3ka-as.a.run.app}"

# Public URL of the deployed worker service (printed by scripts/deploy-service.sh worker). The api
# enqueues Cloud Tasks to it and the worker checks it as the OIDC audience (spec 07).
export WORKER_URL="${WORKER_URL:-}"
# Cloud Tasks queue and the service account whose token the tasks carry (scripts/setup-tasks.sh).
export TASKS_QUEUE="${TASKS_QUEUE:-runs}"
export TASKS_SERVICE_ACCOUNT="${TASKS_SERVICE_ACCOUNT:-tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com}"
# Secret Manager secret holding the Gemini API key, mounted as GEMINI_API_KEY on both services.
export GEMINI_SECRET="${GEMINI_SECRET:-gemini-api-key}"
