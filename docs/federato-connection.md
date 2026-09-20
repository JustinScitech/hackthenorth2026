# Federato connection

Live triage uses server-side OAuth client credentials. Cases entered locally do not require this connection. These three settings select the service; they are not client credentials:

| Variable | Purpose |
| --- | --- |
| `FEDERATO_AUTH_URL` | Token endpoint that receives the client ID and secret |
| `FEDERATO_AUDIENCE` | API identifier requested in the token grant |
| `FEDERATO_HANDLER_URL` | Handler used for schema discovery and read-only queries |

The defaults in `.env.example` are the organizer's production endpoints. Missing or blank endpoint overrides use those defaults. Overrides must retain the respective trusted Federato HTTPS origin; redirects, embedded URL credentials, and fragments are rejected to avoid forwarding secrets to other destinations.

Keep `FEDERATO_CLIENT_ID` and `FEDERATO_CLIENT_SECRET` in ignored `.env.local`, never in a `NEXT_PUBLIC_` variable. Local CLI scripts load `.env.local` and `.env`; Next loads `.env.local` ahead of `.env`. Avoid conflicting values. Set the same variables in the deployment provider's server environment and restart/redeploy after changing them. Environment files must not be committed.

## Verify

Run `npm run triage` to authenticate, discover schema, fetch and rank the live queue. It writes ignored reports under `data/` and does not modify Federato records. In the app, open Federato triage and select **Rank live records**. Missing credentials and rejected configuration are reported rather than replaced with demo results.

For authentication failures, check the issued client credentials and audience. For handler 403/404 responses, check permissions and the handler path. Never paste tokens, secrets, or upstream response bodies into screenshots or support messages. Tokens remain server-side and are reused within a client instance until near expiry; a handler 401 triggers one token refresh. Reads retain bounded retries and request timeouts.
