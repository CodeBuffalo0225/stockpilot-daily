#!/usr/bin/env bash
# Point this project at the local Supabase stack.
#
#   npx supabase start          # once, to bring the stack up
#   ./scripts/use-local-supabase.sh
#
# Reads the stack's credentials straight from the CLI and writes .env.local.
# Values are never echoed — the file is written from a pipe so a shared terminal
# or a transcript never captures the service role key, even though the local
# one is a well-known development value.

set -euo pipefail
cd "$(dirname "$0")/.."

if ! npx supabase status >/dev/null 2>&1; then
  echo "Local Supabase is not running. Start it with: npx supabase start" >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
npx supabase status -o env > "$TMP"

# shellcheck disable=SC1090
API_URL="$(grep -E '^API_URL=' "$TMP" | cut -d= -f2- | tr -d '"')"
SERVICE_KEY="$(grep -E '^SERVICE_ROLE_KEY=' "$TMP" | cut -d= -f2- | tr -d '"')"

if [ -z "$API_URL" ] || [ -z "$SERVICE_KEY" ]; then
  echo "Could not read API_URL / SERVICE_ROLE_KEY from 'supabase status -o env'." >&2
  exit 1
fi

{
  echo "# Written by scripts/use-local-supabase.sh — local stack only."
  echo "# Do not commit. Production values belong in Vercel's env settings."
  echo "SUPABASE_URL=$API_URL"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY"
} > .env.local

echo "Wrote .env.local pointing at the local stack ($API_URL)."
echo "Service role key written without being displayed."
