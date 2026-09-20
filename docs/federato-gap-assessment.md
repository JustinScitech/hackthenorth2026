# Federato challenge assessment

Reviewed against the organizer's Student Project Guidelines, Appetite Guidelines (page 2 visually verified), API Documentation, Query Request Body, Glossary, and Data Schema.

## Implemented requirements

- Cases and Federato triage use the same eight-factor carrier appetite scorer.
- Federato authenticates server-side, discovers schemas, expands references, paginates by stable ID, and records each query and its reason.
- The default queue is Submission when available. Policy is an explicit optional scope, or a fallback when Submission does not exist.
- A second bounded Policy query supplies missing submission evidence through the discovered Policy.submission reference. A policy is used only when the link is unique and insured ID, line, and effective date match. No name-based matching or substitution of requested limit for TIV occurs.
- Unmatched, conflicting, ambiguous, and incomplete submissions remain in the ranked queue. If policy pagination is truncated, enrichment is disabled because uniqueness cannot be established.
- All lifecycle statuses are included and displayed. An open-only filter is not invented from undocumented status semantics.
- Results show underlying match score, capped priority score, specific referral factors, missing evidence, source paths, and link provenance. Downloads preserve scope and score explanations.
- Cases collect premium, business type, line, dates, eligible construction percentage, and five-year loss dollars plus completeness confirmation. The local queue ranks the latest 1,000 cases using priority, match score, and stable ID.
- Durable broker follow-up, retries, audit history, and human decisions remain in place. Cases pause for missing required appetite evidence.
- Existing saved demo findings are labeled legacy; they are not silently represented as carrier-compliant analyses.

## Running and migration

Install dependencies with `npm ci`. Run `npm run db:migrate` before starting the updated web app and worker. The additive migration adds nullable JSON appetite inputs and scored results; existing decisions and audit events are preserved.

Set organizer-issued `FEDERATO_CLIENT_ID` and `FEDERATO_CLIENT_SECRET` in ignored environment files. Run `npm run triage` or open `/triage` and select **Rank live records**. The CLI saves ignored schema and report files under `data/`. No Federato records are mutated.

Leave `FEDERATO_RESOURCE` empty for automatic Submission scope. Set it to `Policy` only for an intentional policy review. `FEDERATO_FIELD_MAP` overrides apply to the selected primary resource and must resolve against its discovered schema. Never map loss counts to five-year loss dollars or policy/requested limits to TIV.

Cases accept USD evidence. Broker responses can supply missing structured facts on separate labeled lines:

```text
Business type: new
Line of business: property
Premium: 85000
Eligible construction percent: 75
Five-year loss value: 0
Five-year history complete: yes
Effective date: 2026-01-01
Expiration date: 2027-01-01
```

Only explicitly labeled fields are parsed for these additional concepts; unsupported narrative remains missing. Later broker responses override earlier labeled appetite values. Original structured intake takes precedence over original note values. Building year still supports the existing model/parser extraction. Historical claim counts are context only and never establish five-year loss dollars.

## Scoring assumptions

The carrier supplies thresholds, not weights. Submission type and line each have weight 10; state, TIV, premium, and building age each 15; construction and losses each 10. Target matches earn full weight, acceptable matches 80%, and outside/unknown zero. Priority is capped at 49 for any exception, otherwise 69 for missing required evidence. Sort by priority descending, match score descending, then ID. Scores are not acceptance probabilities.

- New business is acceptable; renewals are not acceptable. Property is required.
- Accepted states: OH, PA, MD, CO, CA, FL, NC, SC, GA, VA, UT. The first six are targets.
- TIV maximum $150M; target $50M-$100M. Premium $50K-$175K; target $75K-$100K.
- Buildings newer than 1990; target newer than 2010. Use the oldest exposure building. Exactly 1990 remains unknown.
- More than 50% eligible JM/non-combustible/steel/masonry non-combustible construction. Exactly 50% remains unknown. Unique building count is an explicit interpretation of the unspecified weighting basis.
- Loss dollars must be below $100K over five years. Exactly $100K remains unknown. A direct verified five-year total or an explicit complete-history declaration can establish a pass.
- Policy claims establish only a lower bound: valid dated paid amounts plus reserves within five years of report time. An empty collection, malformed date, missing amount, or incomplete account history cannot establish a pass. A verified lower bound above $100K establishes an exception even without complete history.
- The incurred basis and report-time window anchor are application interpretations; the guide does not specify them.
- No headquarters substitution for insured exposures, no invented primary state for multi-state locations, and no unverified currency conversion.
- Account name, effective date, expiration date, and valid date ordering are required.

## Validation and remaining limits

### Case-flow alignment fixes

- Blank/null intake appetite fields no longer erase explicitly labelled values in the original broker notes. Supplied intake values (including zero and false) retain precedence; later broker replies can supersede them. An unchecked completeness flag stays conservative and does not become confirmed history merely because a note says otherwise.
- Public construction findings recognize Steel Frame and Joisted Masonry/JM as eligible categories without calling them combustible referrals. These findings do not establish an account-wide construction percentage or change the eight-factor score.
- Case progress and extraction narration distinguish the eight appetite factors and five-year loss dollars from contextual three-year loss counts.
- Regression coverage includes a real-worker case with blank intake fields and complete broker-supplied appetite evidence, along with updated browser expectations for the current UI.

External enrichment remains an optional, separate research aid. These fixes do not invent carrier rules or introduce an undocumented ranking adjustment to claim the enrichment bonus.

### Source evidence audit, September 19, 2026

A fresh read of all 158 submissions found 38 Property submissions and 120 other lines. The 27 linked Property submissions have valid building years, positive building TIVs, and USD policy currency. The API's "Steel Frame" label is now recognized as eligible steel construction; the missing alias previously made 16 submissions (five Property) unnecessarily unknown.

After that correction, Property submissions have these unresolved checks (categories overlap):

- Primary risk state: 31, consisting of 20 linked multi-state risks without a primary-location marker and 11 unlinked submissions. Headquarters is not a substitute.
- Construction: 17, consisting of six exact 50% eligible mixes and 11 unlinked submissions. The guideline leaves the 50% boundary unspecified.
- Five-year loss value: 19, consisting of eight linked submissions without sufficient complete-history evidence and 11 unlinked submissions. Other known lower bounds may establish exceptions without establishing completeness.
- Premium, business type, expiration, TIV, and building age: the same 11 unlinked Property submissions. The schema offers no direct equivalent fields for these; requested limit is not TIV.

Browserbase currently captures a user-supplied public URL's title and excerpt for Cases and stores it as evidence. That evidence is not passed to the appetite scorer, and Federato triage does not invoke Browserbase. This is external research collection, not the optional ranking-affecting enrichment bonus. Public evidence may corroborate building information, but cannot establish undisclosed premiums or complete private loss history.

Live verification read all 158 Submission records and 113 linked Policy records across seven pages. It enriched 113 uniquely compatible submissions and retained 45 without linked policy evidence. Counts reflect the observed dataset, not fixed assumptions.

Regression tests cover shared case scoring, renewal rejection, missing dollar evidence, malformed claims, duplicate/ambiguous/conflicting links, partial enrichment, stable score ties, schema mapping, pagination, and API envelopes. Browser tests exercise intake, broker responses, scoring output, and human decisions against an isolated local database.

The source data can remain incomplete: no algorithm can manufacture missing account loss history or a primary location. These remain explicit investigation requests. Policy and submission reads are not a transactional API snapshot; pagination checks detect count changes and duplicates but cannot prove snapshot isolation.

External enrichment is an optional challenge bonus. Public-source excerpts remain evidence only and do not claim to change ranking. The app has authentication and an email allowlist, but tenant isolation, role-based authorization, shared throttling, and persisted triage report history are production hardening beyond this challenge scope. No automated approvals, binding, or outbound broker messages are performed.
