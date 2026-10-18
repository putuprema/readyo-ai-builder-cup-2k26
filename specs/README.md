# Specs

One file per feature. Each spec has: Goal, Depends on, Inputs and outputs, Behavior, Acceptance criteria, Tasks, Out of scope.

## Order

| Spec | What | Owner track |
|---|---|---|
| 00-foundation | Repo skeleton, deploy hello world to Firebase Hosting and Cloud Run | Both, first |
| 01-contracts | Shared types, Firestore layout, API endpoints | Both, first |
| 02-simulate | Rules table and `simulate()` | Engine |
| 03-snapshot-metrics | Monthly snapshot and the seven readiness metrics | Engine |
| 04-extraction | Gemini extraction and normalization (stages 2–3) | AI |
| 05-pricing | Goal price estimate with search grounding (stage 1) | AI |
| 06-agent | Recommendation agent calling `simulate()` (stage 6) | AI |
| 07-pipeline-runs | Cloud Tasks worker, run status, triggers, monthly delta | Backend |
| 10-ui-goal-creation | Welcome, goal forms, documents, second-goal reuse | UI |
| 11-ui-progress-result | Progress view and readiness result | UI |
| 12-ui-goals-list | Goals list and empty states | UI |
| 13-ui-monthly-assumptions | Monthly check-in and Assumptions | UI |

00 and 01 come first because everything else builds against them. After that the tracks can run in parallel on separate branches.

## Milestones

**M1: the demo story works end to end, narrowly.** House goal only, one bank format, one PayLater format, one investment screenshot. Real extraction, real `simulate()`, real agent, real result page, deployed. Specs: 00, 01, 02, 03, 04, 05 (house only), 06, 07, 10 (house form + documents), 11.

**M2: breadth.** Car and wedding goals, goals list, second-goal reuse, monthly check-in with delta, Assumptions page. Specs: 05 (all goals), 07 (monthly), 10 (rest), 12, 13.

**M3: polish.** Empty states, error states, demo account seeded with data, performance numbers for the deck.

Do not start M2 until M1 is deployed and the demo story runs.

## The session loop

Start each coding session with one spec and one task range:

> Read `specs/02-simulate.md` and the sections of `docs/analysis.md` it links to. Plan tasks 1–3. Wait for my approval before writing code.

Then: approve or correct the plan → implement one task → tests for its acceptance criteria pass → commit → next task. End the session with `docs/progress.md` updated. Start a new session for the next spec rather than continuing a long one.

When the build shows a spec is wrong, fix the spec first, then the code, in the same commit.
