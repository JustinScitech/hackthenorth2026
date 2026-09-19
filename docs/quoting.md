# Quoting assistant (Intact challenge)

`/quote` is a public, conversational way to get a tenant or car insurance estimate. It is a functional prototype built during Hack the North 2026 on top of the Astra Risk underwriting agent; it shares the agent's extraction, resolution, and telemetry code and is held to the same offline evals.

## Where to find it

- **Public:** `/quote`, linked as "Get an estimate" from the landing page navigation and footer and from the site header and footer on every other public page. No account.
- **Workspace:** `/quotes` ("Quotes" in the sidebar) lists every conversation as one evolving record: product, province, status, the estimate or referral, how many turns it took, which model read the message, and the facts heard. `GET /api/quotes` returns the same list to signed-in users.

## The problem

Getting a personal-lines quote today means a long form that asks for everything up front, in the insurer's vocabulary, before showing a price. Most people know a few things (where they live, roughly what their belongings are worth, what car they drive) and not the rest. The prototype flips that: say what you know, get an estimate immediately from the facts you gave, and see exactly why each remaining question is being asked.

## How AI is used

1. **Reading the request.** A deterministic parser (`src/quote/intake.ts`) reads the person's message for the product, province or city, contents value, vehicle, driver age, claims, mileage, usage, and coverage. It only takes facts the text states; ambiguous phrasing is left blank so the assistant asks. Its behaviour is pinned by 10 intake evals.
2. **Filling gaps with a model.** When a Gemini or OpenAI key is configured, `src/quote/model-intake.ts` races the configured models with a strict JSON schema and a 14-second deadline. The model may only fill fields the parser left empty; it can never override a parsed value. The page tells the person which model read their message.
3. **Deciding what to ask.** `src/quote/rating.ts` computes what is still required, what can be assumed for a partial estimate, and when a person must take over (three or more claims, high-value contents, classic or very expensive vehicles, provinces where basic auto insurance is public). Every question carries a plain-language `why`.
4. **Explaining the price.** Each factor in the estimate is listed with its direction (increases, decreases, neutral) and the assumption behind any unanswered question is stated.

No model sets a price. The rate tables are fictional and deterministic, so the same inputs always give the same estimate.

## The user journey

1. The person types a message in their own words ("I rent an apartment in Toronto, my things are worth about $20,000, no claims").
2. The assistant replies with a monthly and annual range, the factors behind it, the assumptions it made, and the questions that would tighten the range. If the message did not say which product, it asks first. If a required fact is missing, it asks for that before showing any price.
3. The person answers the questions with labelled controls (province, deductible, coverage, yes/no) and the estimate updates. Facts from earlier turns are remembered, so nothing is asked twice.
4. When the situation needs a person, the assistant says so and gives the next step (speak with an advisor; in BC, SK, and MB buy basic coverage from the public insurer first).

## Accessibility

- Every question is a real `<label>` with an `aria-describedby` reason; enumerated answers are native `<select>` controls, numbers are numeric inputs.
- Results render inside an `aria-live="polite"` region so screen readers announce the estimate and questions.
- Copy avoids insurance jargon and field names; the recommendation is a single short sentence.
- The layout follows the site's existing responsive rules and works at phone width.

## API

`POST /api/quote` (same-origin, no session): `{ quoteId?: uuid, product?: "tenant" | "auto", text?: string, answers?: {...} }` returns `{ quoteId, product, heard, result, model }` where `result` is a `QuoteResult` (`estimate`, `needs_info`, or `refer`). See `src/quote/types.ts`.

## What is stored

Each conversation gets a client-generated `quoteId`. `POST /api/quote` upserts a row in the `quotes` table with the product, status, province, estimate, the structured facts heard, the count of open questions, any referral reason, the model used, and a turn counter. The person's free text is never stored; only what the assistant understood from it. Saving is best-effort: a database problem is logged and the person still gets their estimate.

## Assumptions and limitations

- Rates are demo values chosen to make the journey legible, not filed rates. Ranges are ±10% around the demo premium.
- Only Canadian provinces and territories are supported; cities map to provinces through a small table.
- Auto quoting covers one driver and one vehicle; tenant quoting covers contents and liability only.
- No account, no binding, and no payment. Stored records hold structured facts only.

## Future improvements

- Replace the demo tables with a real rating service and add the province-specific mandatory coverages.
- Add document upload (a lease or a vehicle registration) as another source, resolved with the same agreement rules the underwriting flow uses.
- Let a person resume a saved quote by reference, and let an advisor claim a referral from the workspace list.

## Evals

`npm run eval -- --suite quote` runs 39 cases: required facts, referrals, monotonic pricing (a higher deductible is always cheaper, a claim always costs more), public-insurer provinces, explained factors, and conversational intake. See `evals/README.md`.
