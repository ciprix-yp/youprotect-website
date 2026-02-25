#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${QC_BASE_URL:-https://youprotect-website.pages.dev}"
PRODUCT_ID="${QC_PRODUCT_ID:-9ff94685-9155-448d-af14-1445d0caddad}"
TS="$(date +%s)"

echo "[qc] build"
npm run -s build >/tmp/youprotect-qc-build.log
echo "[qc] build OK"

echo "[qc] api view_samples"
VIEW_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/leads" \
  -H 'Content-Type: application/json' \
  -d "{\"nume\":\"QC View\",\"email\":\"qc.view.$TS@example.com\",\"telefon\":\"0721234567\",\"companie\":\"YouProtect QA\",\"mesaj\":\"qc view\",\"conversion_intent\":\"view_samples\",\"urgenta\":\"normal\",\"echipament\":\"complet\",\"team_size\":\"6_20\",\"decision_stage\":\"compar_oferte\",\"pain_points\":[\"durata_mica\"],\"desired_outcomes\":[\"cost_total\"],\"payment_method\":\"partial_50_la_comanda\",\"selected_products\":[{\"id\":\"$PRODUCT_ID\",\"selected_from\":\"catalog\"}],\"source_url\":\"/produse\"}")"

echo "$VIEW_RESPONSE" | rg -q '"success":true'
echo "$VIEW_RESPONSE" | rg -q '"pipeline_stage":"offer_in_progress"'
echo "[qc] view_samples OK"

echo "[qc] api book_call"
BOOK_RESPONSE="$(curl -sS -X POST "$BASE_URL/api/leads" \
  -H 'Content-Type: application/json' \
  -d "{\"nume\":\"QC Book\",\"email\":\"qc.book.$TS@example.com\",\"telefon\":\"0721234567\",\"companie\":\"YouProtect QA\",\"mesaj\":\"qc book\",\"conversion_intent\":\"book_call\",\"urgenta\":\"normal\",\"echipament\":\"incaltaminte\",\"team_size\":\"6_20\",\"decision_stage\":\"compar_oferte\",\"pain_points\":[\"confort_scazut\"],\"desired_outcomes\":[\"rata_purtare\"],\"source_url\":\"/\"}")"

echo "$BOOK_RESPONSE" | rg -q '"success":true'
echo "$BOOK_RESPONSE" | rg -q '"booking_url":"https://outlook.office.com/book/Booking@youprotect.ro/\?ismsaljsauthenabled"'
echo "[qc] book_call OK"

echo "[qc] PASS"
