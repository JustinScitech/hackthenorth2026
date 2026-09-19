# Sponsor integration map

## Product spine

Build an underwriting case investigator for Federato: ingest submissions; discover and normalize the supplied schema; apply the supplied appetite guidelines; investigate missing, conflicting, and public-source facts; rank cases by actionable review priority; and let an underwriter decide. Temporal retains the case across long waits, broker replies, and worker restarts. No model or external source automatically quotes, binds, approves, or declines coverage.

This is a delivery map, not a claim that every listed sponsor has a confirmed 2026 prize. Confirm exact prize rules and submission limits in the event portal before selecting tracks.

| Sponsor | Underwriting role | Current status | Live proof needed |
| --- | --- | --- | --- |
| Federato | Source submissions, schema, glossary, and appetite rules | Manual intake and fictional checks only | Provided API/schema/guidelines, real import, ranked in-appetite queue |
| Rox | Agent handling messy operational data and meaningful actions | Missing-field follow-up and conflict detection; Temporal wait/resume | Real messy Federato cases, measured resolutions and actions |
| OpenAI | Structured extraction from broker notes | Coded, optional key | Run a case with API key and show evidence/uncertainty |
| Tiger Data | Relational case/audit state plus time-series operations analytics | PostgreSQL-compatible schema; no Tiger Data connection yet | Hosted Tiger Data instance and useful metrics dashboard |
| Gemini | Independent extraction of construction and loss facts | Coded, optional key; disagreements become review findings | Run both models on conflicting broker text |
| Browserbase | Read an explicitly supplied public property/business source | Coded, optional key; URL/excerpt attached to case | Live browser session with cited source |
| Sentry | Observe worker failures without transmitting submission text | Coded, optional DSN | Test event and worker trace in Sentry |
| Expo | Mobile underwriter triage and decision | Not built | Working Expo app using same case API and human review |
| GoDaddy | Branded URL for deployed review workspace | Not purchased or configured | Domain registration and deployed app; purchase requires team action |
| MongoDB Atlas | Immutable broker submissions, replies, and public evidence | Coded; local Mongo roundtrip verified | Atlas URI, live read/write, proof in Atlas collection |
| ElevenLabs | Spoken review brief for underwriter triage | Coded, optional key | Play generated case brief with configured voice |
| Composio | Authorized broker email or other external tool action | Not connected | OAuth/tool connection, consented follow-up, audit receipt |
| Cloudflare Agents SDK | Edge-facing case assistant or deployment | Not connected; Temporal remains workflow owner | Real agent feature on Cloudflare without duplicating orchestration |
| Linq | Consented iOS broker follow-up messaging | Not connected | Verified sender/recipient, opt-in, sent message and receipt |
| Solana badge | Event identity or demo access, not underwriting risk | Not built | Only pursue if rules support an identity use case; never infer insurance risk from a person's social profile |

## Build order

1. Integrate Federato's provided data, schema discovery, glossary, and appetite guidelines. Replace fictional checks and add case ranking with cited rule/version evidence.
2. Configure and demonstrate MongoDB Atlas, OpenAI, Gemini, Browserbase, Sentry, and ElevenLabs against synthetic or sponsor-provided data. These support the same case investigation.
3. Add one real broker follow-up channel through Composio or Linq after consent, sender credentials, and delivery rules are available. Keep the Temporal timer as the trigger and the audit trail as the record.
4. Add Tiger Data operational analytics, an Expo triage client, a Cloudflare edge assistant, or a GoDaddy domain only when the core underwriting demo is strong and the current prize rules reward the feature.

## Evidence checklist

For each prize entry, record the sponsor's current eligibility text, a configured key/account, the exact running feature, a test result, and a 30-second demo clip. A dependency in `package.json` or a disabled feature flag is not enough.
