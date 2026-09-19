#!/bin/zsh
# Push production environment variables to the linked Vercel project.
# Reads secrets from the gitignored .env in the repo root; nothing is hard-coded here.
#
# Usage:  ./scripts/vercel-env.sh
# Then:   vercel --prod
set -e
cd "$(dirname "$0")/.."
set -a; source ./.env; set +a

add() {
  printf '%s' "$2" | vercel env add "$1" production --force >/dev/null 2>&1 \
    && echo "set  $1" || echo "FAIL $1"
}

# Vercel cannot reach localhost, so production uses the hosted databases.
# uselibpqcompat=true is required: Node's pg driver otherwise rejects Tiger Data's certificate chain.
add DATABASE_URL         "${TIGERDATA_DATABASE_URL}&uselibpqcompat=true"
add MONGODB_URI          "$MONGODB_ATLAS_URI"
add MONGODB_DB           "$MONGODB_DB"

# No Temporal server is reachable from Vercel yet. Case creation returns 503 until this
# points at Temporal Cloud (or another public Temporal) and a worker runs somewhere.
add TEMPORAL_ADDRESS     "$TEMPORAL_ADDRESS"

add BETTER_AUTH_SECRET   "$BETTER_AUTH_SECRET"
add AUTH_ALLOWED_EMAILS  "$AUTH_ALLOWED_EMAILS"
add GEMINI_API_KEY       "$GEMINI_API_KEY"
add GEMINI_MODEL         "$GEMINI_MODEL"
add BROWSERBASE_API_KEY  "$BROWSERBASE_API_KEY"
add ELEVENLABS_API_KEY   "$ELEVENLABS_API_KEY"

# Optional: only when set locally.
[ -n "$GOOGLE_CLIENT_ID" ]     && add GOOGLE_CLIENT_ID     "$GOOGLE_CLIENT_ID"
[ -n "$GOOGLE_CLIENT_SECRET" ] && add GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"

# Set after the first deploy, once the production domain is known:
#   printf 'https://<your-domain>' | vercel env add BETTER_AUTH_URL production --force
echo "done"
