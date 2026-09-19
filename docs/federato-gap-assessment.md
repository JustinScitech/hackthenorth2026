# Federato challenge assessment

Reviewed against `STUDENT_PROJECT_GUIDELINES.pdf`, `APPETITE_GUIDELINES.pdf`, `API_DOCUMENTATION.pdf`, `DATA_SCHEMA.pdf`, and `QUERY_REQUEST_BODY.pdf` from the organizer's documentation package.

## Findings and changes

| Requirement | Original implementation | Added implementation |
| --- | --- | --- |
| Query the supplied API | No Federato client | Server-side Auth0 client credentials, token expiry/401 refresh, bounded 429/5xx retries, request timeouts |
| Discover the data shape | No schema discovery | Runtime resource/field discovery, ambiguity detection, reference-aware projections, validated mapping overrides |
| Reason about requested data | Manual intake only | Select the resource with the most direct appetite fields, request only relevant fields, expand required references, explain each choice and subsequent page request |
| Apply supplied appetite | Fictional NY/NJ/PA, $5M TIV, 1980 and three-year loss-count rules | Separate challenge scorer using all eight factors from the supplied 2025 commercial-property table |
| Score and rank | Per-case findings without a queue score | Weighted 0-100 scores, target/acceptable distinctions, exception/incomplete-data caps, stable ranking and top 20 |
| Explain every decision | Brief for fictional rules | Factor-level points, source paths, observed values, rule explanations, missing data, recommendations and query trace |
| Handle 50+ records | Local manually entered cases | Live verification read 113 Policy records in three pages; tests cover 123 records, partial limits and inconsistent pagination |
| Present usable output | Case-review UI | `/triage` dashboard and `npm run triage` CLI with a local JSON report |
| Optional enrichment | Browserbase excerpt without ranking effect | Remains optional evidence, not a structured risk signal; HTTP error pages now rejected and sessions have an explicit lifetime |

The original Temporal case-review workflow remains a separate, explicitly fictional demo. Federato ranking does not automatically import cases, approve, decline, bind coverage, or send messages.

## Running

Use Node 22+ and install dependencies with `npm ci`. Put organizer-issued credentials in ignored `.env`:

```dotenv
FEDERATO_CLIENT_ID=...
FEDERATO_CLIENT_SECRET=...
```

Run `npm run triage`, or `npm run dev` and open `/triage`, then select **Rank live submissions**. This flow does not require PostgreSQL, Temporal, MinIO, OpenAI, or Browserbase. The CLI saves the discovered schema to `data/federato-schema.json` before planning and saves the full report to `data/federato-triage.json`. Both are ignored by Git. Secrets remain server-side and are not included in reports.

The live endpoint returned a workflow envelope despite `outputOnly=true` and used `results` for ungrouped query rows; both behaviors are supported alongside the documented unwrapped/grouped forms.

Optional configuration:

```dotenv
FEDERATO_RESOURCE=Policy
FEDERATO_FIELD_MAP={"premium":"premium","account":"insured.name"}
```

Supported mapping concepts: `account`, `state`, `business`, `line`, `tiv`, `premium`, `year`, `constructionPercent`, `lossValue`, `effective`, `expiration`. Overrides must resolve in the discovered schema. Except building year, mappings must identify a single value, not an array of individual exposures. Map `lossValue` only to a verified **five-year dollar total**, and `constructionPercent` only to an eligible share in **0-100** units. Schema shape validation cannot certify semantic equivalence; inspect the schema and trace before overriding.

## Scoring decisions

The carrier supplies thresholds, not weights. Application weights: submission type 10, line 10, state 15, TIV 15, premium 15, building age 15, construction 10, five-year losses 10. Target matches earn 100% of the factor weight; acceptable matches earn 80%; exceptions and unknowns earn zero. Any exception caps the final score at 49; incomplete required data caps it at 69. Sort descending by final score, then raw score, then ID. Caps avoid allowing strong matches to offset a known appetite exception; they do not constitute automated rejection.

- New business and Property are required. Accepted states: OH, PA, MD, CO, CA, FL, NC, SC, GA, VA, UT; the first six are targets.
- TIV: up to $150M, target $50M-$100M. Premium: $50K-$175K, target $75K-$100K. Ranges are inclusive.
- Buildings: newer than 1990, target newer than 2010; use the oldest exposure building. Exactly 1990 is unspecified in the source and requires clarification.
- Construction: more than 50% eligible JM/non-combustible/steel/masonry non-combustible. Exactly 50% requires clarification. When deriving the mix, weight unique buildings by TIV; this is an explicit application assumption because the source does not state a weighting basis. Unknown codes remain unknown.
- Loss value: under $100K over five years. Exactly $100K requires clarification. Observed dated claims use incurred dollars (paid indemnity/expense plus reserves) in the five years ending at report time. The source does not specify incurred versus paid or the window anchor; this is an explicit interpretation. Above-threshold observed claims establish an exception; fewer/no linked claims do not prove complete five-year history.
- Sum TIV only from complete, unique exposure buildings. Never use policy limit as TIV or headquarters as the primary insured location. Infer primary state only if all exposure locations agree. Missing/foreign currency leaves dollar factors unknown; no invented FX conversion.
- Required account name and effective/expiration dates must be present and dates ordered. No unsupported expiry preference is added.

## Remaining gaps and limits

1. **Queue scope:** the live schema has Policy and Submission resources. Policy has substantially more appetite data, so the default ranks all 113 Policy records, including their different lifecycle statuses. It is not a complete ranking of standalone Submission records or an open-only submission pipeline. The selected resource and scope are shown in the trace. A production submission queue needs explicit status semantics and a verified Submission-to-Policy reconciliation, including unmatched submissions.
2. **Data sufficiency:** many records have multiple risk states and no explicit primary-state marker. Complete five-year account history is not established by policy-linked claims. These factors request clarification rather than becoming false passes.
3. **Schema adaptation:** uses documented field concepts and the observed exposure/claim structure, not unrestricted semantic inference. Unsupported structures remain unknown and can require additional adapters. It adapts projections and pagination, but does not yet perform goal-dependent secondary investigations or portfolio concentration queries.
4. **Optional enrichment:** public-source excerpts do not affect ranking and therefore do not yet meet the challenge's bonus requirement for enrichment that changes decisions. A structured, cited risk signal and explicit scoring policy would be needed.
5. **Production readiness:** existing app lacks authentication/tenant isolation. Same-origin protection on the new POST is not authentication. Add access control before public deployment, request rate limits/shared token caching, persisted report history, and workflow cancellation. The dashboard holds results in memory; CLI reports are local. Requests time out individually; a large paginated run has no global deadline. A maximum of 1,000 rows is clearly labeled as partial when reached.
6. **Browserbase:** HTTP status and session lifetime are improved; DNS/private-network validation and retry/error observability still need hardening. Browserbase was not exercised live for this change.

## Validation

- `npm test`: 21 tests covering existing analysis plus scoring boundaries, missing/conflicting data, aggregation deduplication, reference expansion, currency, five-year claim windows, schema overrides, 123-record ranking, pagination failures, Auth0 refresh, and both observed API response shapes.
- `npm run typecheck` and `npm run build`.
- Live credentialed read: schema discovery and all 113 Policy records across three 50-record pages. No source records were mutated.
- HTTP integration check after updating from main: `/triage` returns 200; same-origin `/api/triage` returns all 113 ranked records and top 20; cross-origin POST returns 403. No browser was available for visual UI verification.
