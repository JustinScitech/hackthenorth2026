# Evidence-led review plans

The public UnderwriteIQ repository (https://github.com/BaronLiu1993/htn-2026), inspected on 2026-09-20, prompted a review of evidence sufficiency and actionable follow-up in Astra. No license file was found in that checkout. No source code, training examples, benchmark labels, model weights, or assets were copied. This implementation independently uses Astra's existing scored criteria and provenance.

## Behavior

- Queue health counts all evaluated records, not only the displayed top results. Exception records take precedence over incomplete records; the separate evidence-gap count includes both.
- Review tasks preserve each failed or unknown criterion, its determining rule, and its source. Additional missing submission context becomes a separate task without duplicating criterion gaps.
- Known exceptions remain exceptions even when information is incomplete. Obtaining documents does not waive a carrier rule.
- Assessed factor counts indicate data availability, not external verification, confidence, or approval probability.
- The checklist does not send requests, approve exceptions, or change ranking. No scoring weights, caps, API scope, or appetite boundaries changed.

## Verification

Run `npm test` for review-plan regression tests and `npm run typecheck`. The tests cover mixed exceptions and gaps, task deduplication, source preservation, unchanged input scores, and mutually exclusive queue counts. These are software regression tests, not an independent underwriting accuracy benchmark.
