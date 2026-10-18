#!/usr/bin/env bash
# One-time setup for browser uploads (spec 10): the default bucket must accept PUTs from the
# web app's origins (CORS on signed URLs), and the api's service account must be able to sign
# URLs (it has no private key on Cloud Run, so it signs through the IAM credentials API).
# Usage, from the repo root after the first api deploy:  scripts/setup-storage.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=env.sh
source "$root/scripts/env.sh"

bucket="${STORAGE_BUCKET:-${PROJECT_ID}.firebasestorage.app}"
project_number="$(gcloud projects describe "$PROJECT_ID" --format 'value(projectNumber)')"
compute_sa="${project_number}-compute@developer.gserviceaccount.com"

echo "Allowing the compute service account to sign URLs (${compute_sa})..."
gcloud iam service-accounts add-iam-policy-binding "$compute_sa" \
  --project "$PROJECT_ID" \
  --member "serviceAccount:${compute_sa}" \
  --role roles/iam.serviceAccountTokenCreator >/dev/null

echo "Setting CORS on gs://${bucket} for browser PUTs..."
cors_file="$(mktemp)"
cat > "$cors_file" <<JSON
[
  {
    "origin": ["https://${HOSTING_SITE}.web.app", "https://${HOSTING_SITE}.firebaseapp.com", "https://${PROJECT_ID}.web.app", "https://${PROJECT_ID}.firebaseapp.com", "http://localhost:3000"],
    "method": ["PUT"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
JSON
gcloud storage buckets update "gs://${bucket}" --cors-file="$cors_file"
rm -f "$cors_file"
echo "Done. Deploy the api with STORAGE_BUCKET=${bucket} (scripts/deploy-service.sh api)."
