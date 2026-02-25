#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TASK_ID="${1:-}"
DIRECT_DEPLOY="${2:-}"
BRANCH_NAME="$(git branch --show-current)"
COMMIT_SHA="$(git rev-parse --short HEAD)"
PAGES_PROJECT="${CF_PAGES_PROJECT:-youprotect-website}"

if [ -z "$TASK_ID" ]; then
  echo "Usage: ./scripts/release-iteration.sh <TASK_ID> [--direct-cloudflare]"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit changes before release."
  git status --short
  exit 1
fi

./pm review "$TASK_ID"

git push origin HEAD

echo "Push complete."
echo "Cloudflare Pages (Git integration) will deploy this commit automatically."
echo "Expected commit URL: https://${COMMIT_SHA}.${PAGES_PROJECT}.pages.dev"
echo "Production URL: https://${PAGES_PROJECT}.pages.dev"

if [ "$DIRECT_DEPLOY" = "--direct-cloudflare" ]; then
  ./scripts/deploy-cloudflare.sh "$BRANCH_NAME"
fi
