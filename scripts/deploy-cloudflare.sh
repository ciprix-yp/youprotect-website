#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BRANCH_NAME="${1:-$(git branch --show-current)}"
CF_PAGES_PROJECT="${CF_PAGES_PROJECT:-youprotect-website}"

WHOAMI_OUTPUT="$(npx --yes wrangler whoami 2>&1 || true)"
if echo "$WHOAMI_OUTPUT" | grep -qi "not authenticated"; then
  echo "$WHOAMI_OUTPUT"
  echo "Cloudflare auth missing. Run: npx wrangler login"
  exit 1
fi

npm run build

npx --yes wrangler pages deploy ./dist \
  --project-name "$CF_PAGES_PROJECT" \
  --branch "$BRANCH_NAME"
