#!/usr/bin/env bash
# One place for the deploy settings. Sourced by the deploy scripts.
# Fill these in once the GCP project exists.

export PROJECT_ID="${PROJECT_ID:-YOUR_PROJECT_ID}"
export REGION="${REGION:-asia-southeast2}"          # Jakarta
export AR_REPO="${AR_REPO:-adidi}"                   # Artifact Registry repository name

# Public URL of the deployed api service. Printed by scripts/deploy-service.sh api.
# The web build bakes it in as NEXT_PUBLIC_API_URL.
export API_URL="${API_URL:-https://api-XXXXXXXXXX-et.a.run.app}"
