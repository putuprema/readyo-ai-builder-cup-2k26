# AGENTS.md

## What this project is

[APP NAME] is a financial readiness planner for Indonesians, built by team ADiDi for AI Builder Cup 2026 (BFSI theme). A user picks a long-term goal (house, car or wedding), uploads one month of bank, e-wallet, PayLater/pinjol and investment statements, and gets:

- how many months until they are ready, on the cash path and the loan path side by side,
- which lending rules block them today (e.g. debt-to-income above the bank's cap),
- a short plan of actions, each checked by a month-by-month simulation.

Positioning: "Other trackers record the past. We tell you whether a bank would approve your KPR today, why not, and in which month that changes."

## How we work: spec-driven

Every feature has a spec in `specs/` (see `specs/README.md` for the order and the session loop). Before writing code:

1. Read the spec for the task, plus the `docs/` sections it links to.
2. Propose a plan for the spec's tasks and wait for approval.
3. Implement one task at a time. Write tests for the spec's acceptance criteria. Commit after each task.
4. If a decision changes during the work, update the spec (and `docs/` if needed) in the same commit.
5. Before ending a session, update `docs/progress.md`.

If something is not covered by a spec or the docs, ask instead of guessing.

Background docs:

- `docs/product.md`: goals, inputs, lifecycle, scope.
- `docs/analysis.md`: pipeline, metrics, rules, `simulate()`, the recommendation agent, data model.
- `docs/screens.md`: every screen, its states and behavior.
- `docs/progress.md`: what is done, in progress and next.

The visual design is in `design/` (the design handoff). Use it for layout, components, copy and states. The mockups hard-code some states (selected options, sample numbers); implement real state, and treat every number in them as sample data.

## Hard constraints (hackathon rules)

- AI models: Google only (Gemini, or Gemma). No other model providers.
- Hosting: Google Cloud. Frontend on Firebase Hosting, backend on Cloud Run.
- Language: all code, comments, docs and UI copy in English. Currency and place names stay Indonesian (Rp, KPR, KKB, Tangerang Selatan).
- The submission must be a working prototype, not a mockup.

## Stack

- Frontend: Next.js + TypeScript on Firebase Hosting, Firebase Auth.
- Backend: Cloud Run. Two services: `api` (uploads, goals, short requests) and `worker` (the analysis pipeline). Language: TypeScript. `shared/` is one package imported by `web`, `api` and `worker`.
- Jobs: Cloud Tasks, one task per analysis run.
- Data: Firestore. The frontend listens to status documents in real time.
- Files: Cloud Storage, raw uploads deleted right after extraction (lifecycle rule as a safety net).
- AI: Gemini via the Google Gen AI SDK. Structured output (response schema) for every extraction; Google Search grounding for goal pricing; function calling for the recommendation agent.

## The one principle that matters

**Gemini extracts and explains. Code computes.**

Any number the user sees as a metric, a month count or an approve/block verdict comes from deterministic code over the rules table, never from a model's free text. Gemini's jobs: read documents into structured JSON, classify transactions, estimate a goal's price with sources, propose actions (which code then verifies), and write the explanation text.

## Working conventions

- Build one screen or one pipeline stage at a time. Start screens with mock data that matches the design, then wire them.
- `simulate()` is pure and has unit tests with hand-made profiles. Do not change its outputs without updating the tests.
- Rules and assumptions live in data (`rules` collection / JSON), never hard-coded in logic.
- Money: store integers in rupiah. Display large amounts as "Rp 1.52 bn", "Rp 304 m", "Rp 320 k"; inputs use dot thousands separators ("1.350.000.000").
- Accessibility: real `<button>`, `<a>`, `<label>` elements; touch targets at least 44 px; no emoji in the UI.
- Never log raw statement content or account numbers. Mask account and card numbers before storing.

## Out of scope for the hackathon

Do not add these, even if they seem helpful: master's degree (S2) goal, cash-spending note uploads, alternative suggestions after a skipped action, check-in reminders or notifications, bank or e-wallet API connections, a mobile app, a needs/wants classifier as a user-facing feature.
