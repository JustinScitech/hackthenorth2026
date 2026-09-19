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
  [ -z "$2" ] && { echo "skip $1 (empty locally)"; return 0; }
  printf '%s' "$2" | vercel env add "$1" production --force >/dev/null 2>&1 \
    && echo "set  $1" || echo "FAIL $1"
}

# Vercel cannot reach localhost. src/lib/env.ts picks these hosted targets when deployed
# and adds the pg SSL compatibility flag itself, so the raw connection strings go in as-is.
add TIGERDATA_DATABASE_URL "$TIGERDATA_DATABASE_URL"
add MONGODB_ATLAS_URI      "$MONGODB_ATLAS_URI"
add MONGODB_DB             "$MONGODB_DB"
# Tiger Data presents a certificate chain Node rejects; the merged TLS fix reads this flag.
add DATABASE_SSL_REJECT_UNAUTHORIZED "false"

# The worker must use the same hosted PostgreSQL and MongoDB targets.

add BETTER_AUTH_SECRET     "$BETTER_AUTH_SECRET"
add AUTH_ALLOWED_EMAILS    "$AUTH_ALLOWED_EMAILS"
add GEMINI_API_KEY         "$GEMINI_API_KEY"
add GEMINI_MODEL           "$GEMINI_MODEL"
add BROWSERBASE_API_KEY    "$BROWSERBASE_API_KEY"
add ELEVENLABS_API_KEY     "$ELEVENLABS_API_KEY"
add GOOGLE_CLIENT_ID       "$GOOGLE_CLIENT_ID"
add GOOGLE_CLIENT_SECRET   "$GOOGLE_CLIENT_SECRET"

# Set after the first deploy, once the production domain is known:
#   printf 'https://<your-domain>' | vercel env add BETTER_AUTH_URL production --force
echo "done"
