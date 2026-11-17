#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
DEMO_EMAIL="${DEMO_USER_EMAIL:-demo@ledgerly.local}"
DEMO_PASSWORD="${DEMO_USER_PASSWORD:-LedgerlyDemo123!}"
USER_EMAIL="ledgerly-smoke-$(date +%s)-${RANDOM}@example.test"
USER_PASSWORD="SmokeTest-${RANDOM}-Ledgerly"

api() { curl --silent --show-error --fail-with-body "$@"; }
auth_header() { printf 'Authorization: Bearer %s' "$ACCESS_TOKEN"; }

echo "Checking seeded demo login"
DEMO_SESSION="$(api -X POST "$API_URL/api/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$DEMO_EMAIL" --arg password "$DEMO_PASSWORD" '{email:$email,password:$password}')")"
DEMO_TOKEN="$(jq -er '.accessToken' <<<"$DEMO_SESSION")"
api "$API_URL/api/auth/me" -H "Authorization: Bearer $DEMO_TOKEN" >/dev/null

echo "Checking registration, login, mobile refresh rotation, and /me"
REGISTERED="$(api -X POST "$API_URL/api/auth/register" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$USER_EMAIL" --arg password "$USER_PASSWORD" '{email:$email,password:$password}')")"
ACCESS_TOKEN="$(jq -er '.accessToken' <<<"$REGISTERED")"
REFRESH_TOKEN="$(jq -er '.refreshToken' <<<"$REGISTERED")"
api "$API_URL/api/auth/me" -H "$(auth_header)" >/dev/null
LOGIN="$(api -X POST "$API_URL/api/auth/login" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$USER_EMAIL" --arg password "$USER_PASSWORD" '{email:$email,password:$password}')")"
ACCESS_TOKEN="$(jq -er '.accessToken' <<<"$LOGIN")"
REFRESH_TOKEN="$(jq -er '.refreshToken' <<<"$LOGIN")"
ROTATED="$(api -X POST "$API_URL/api/auth/refresh" -H "Authorization: Bearer $REFRESH_TOKEN")"
ACCESS_TOKEN="$(jq -er '.accessToken' <<<"$ROTATED")"
REFRESH_TOKEN="$(jq -er '.refreshToken' <<<"$ROTATED")"

echo "Checking category CRUD"
CATEGORY="$(api -X POST "$API_URL/api/categories" -H "$(auth_header)" -H 'Content-Type: application/json' \
  --data '{"name":"Smoke category","color":"#445566"}')"
CATEGORY_ID="$(jq -er '.id' <<<"$CATEGORY")"
api -X PATCH "$API_URL/api/categories/$CATEGORY_ID" -H "$(auth_header)" -H 'Content-Type: application/json' \
  --data '{"name":"Smoke edited"}' >/dev/null
api "$API_URL/api/categories" -H "$(auth_header)" | jq -e 'any(.[]; .name == "Smoke edited")' >/dev/null

echo "Checking transaction create, filters, manual edit, and delete"
TRANSACTION="$(api -X POST "$API_URL/api/transactions" -H "$(auth_header)" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg categoryId "$CATEGORY_ID" '{date:"2026-11-15",description:"Smoke test groceries",amount:-32.50,categoryId:($categoryId|tonumber)}')")"
TRANSACTION_ID="$(jq -er '.id' <<<"$TRANSACTION")"
api "$API_URL/api/transactions?q=smoke%20test&page=1&limit=10" -H "$(auth_header)" | jq -e '.total >= 1 and (.data|length >= 1)' >/dev/null
EDITED="$(api -X PATCH "$API_URL/api/transactions/$TRANSACTION_ID" -H "$(auth_header)" -H 'Content-Type: application/json' \
  --data '{"categoryId":null}')"
jq -e '.isManual == true and .categoryId == null' <<<"$EDITED" >/dev/null

echo "Checking CSV upload, row status, and upload history"
UPLOAD="$(api -X POST "$API_URL/api/uploads" -H "$(auth_header)" -F "file=@seed/sample_transactions.csv;type=text/csv")"
jq -e '.status == "done" and .accepted_rows == 2 and .skipped_rows == 1' <<<"$UPLOAD" >/dev/null
UPLOAD_ID="$(jq -er '.id' <<<"$UPLOAD")"
api "$API_URL/api/uploads/$UPLOAD_ID/status" -H "$(auth_header)" | jq -e '.status == "done" and .acceptedRows == 2 and .skippedRows == 1' >/dev/null
api "$API_URL/api/uploads?page=1&limit=10" -H "$(auth_header)" | jq -e '.total >= 1' >/dev/null

echo "Checking analytics"
api "$API_URL/api/analytics/summary?month=2026-11" -H "$(auth_header)" | jq -e 'has("income") and has("expense") and has("transactionCount")' >/dev/null
api "$API_URL/api/analytics/by-category?from=2026-11-01&to=2026-11-30" -H "$(auth_header)" | jq -e 'type == "array"' >/dev/null
api "$API_URL/api/analytics/trend?months=6" -H "$(auth_header)" | jq -e 'length == 6' >/dev/null
api "$API_URL/api/analytics/forecast?category=$CATEGORY_ID" -H "$(auth_header)" | jq -e '.forecast|length == 3' >/dev/null

api -X DELETE "$API_URL/api/transactions/$TRANSACTION_ID" -H "$(auth_header)" >/dev/null
api -X DELETE "$API_URL/api/categories/$CATEGORY_ID" -H "$(auth_header)" >/dev/null
api -X POST "$API_URL/api/auth/logout" -H "$(auth_header)" -H 'Content-Type: application/json' \
  --data "$(jq -cn --arg refreshToken "$REFRESH_TOKEN" '{refreshToken:$refreshToken}')" >/dev/null

echo "Ledgerly backend smoke checks passed"
