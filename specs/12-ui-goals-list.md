# 12 · UI: goals list and empty states

## Goal

The returning user's home: every goal with its status, the monthly banner, and the empty states for a user with no goals.

## Depends on

01-contracts, design artboards 4, 4a, 5a. Behavior: `docs/screens.md` sections "4", "4a", "5a". Wiring: 07-pipeline-runs (run status, banner rule).

## Behavior

- Lists `users/{uid}/goals` live. Order: analysing, then drafts, then active (newest first within each group).
- Filter tabs All / Active / Drafts with counts; the subtitle summarizes counts.
- **Analysing card** reads its run document for stage and percent; Watch progress opens the progress view. No delete.
- **Draft card**: next step from `draftStep` ("calculate the target" / "add documents"), 3-segment bar, delete without confirmation, Continue to the right step.
- **Active card**: headline number and one-line status from the latest analysis; delete opens a confirmation dialog ("This removes the goal and its tracked history. Your statements stay for your other goals."); View opens the result page.
- **Monthly banner** follows the rule in spec 07. Links to the monthly check-in. No date or deadline in the copy.
- **No goals** (4a): replaces the list. Tiles open the goal form with the type preselected.
- **Documents with no goals** (5a): the Documents tab shows this instead of the check-in when the user has no goals.

## Decisions taken while building

- **Order within a group** is by `createdAt`, newest first (so a draft saved again does not jump around). Analysing goals appear under All only; the Active and Drafts tabs show their own status.
- **Analysing card** follows the goal's latest run (`runs` where `goalIds` contains the goal, latest `startedAt`), the same query as the progress view. It shows "Submitted X ago · you can leave this page" and no "time left": run length varies too much (113 to 183 s measured) for an honest estimate.
- **Active card** headline and status are selected from the latest analysis with spec 11's `model.ts` (`pathCards`, `leadingPath`): loan-led goals show the months to the KPR with the plan (choices included once made) and today's blockers ("Blocked today: DTI 37% vs 35% cap · …"); cash-led goals show the cash months with the plan and the no-change figure. 24 months and over read in years.
- **Draft bar**: done steps solid, the current step pale, the rest grey. A draft without `draftStep` resumes at documents when it has an estimate, else at the estimate.
- **Delete**: the card leaves the list at once and comes back with an inline alert if the api refuses. The active-goal confirmation is a native modal `<dialog>` (Escape cancels, focus starts on "Keep it").
- **Banner** shows only when the user has at least one active goal (the copy is about updating active goals), on top of spec 07's rule. "with what moved since {previous month}" appears only when that month was submitted. The rule runs on UTC dates (`monthlyBannerFor`).
- **Car and wedding** are "coming soon" this milestone: the 4a tiles show them with a "Soon" tag and only the house tile opens the form; New goal and Create your first goal open the house form.
- **5a** is the `DocumentsNoGoals` component in `web/components/goals/EmptyStates.tsx`; the Documents page (spec 13) renders it when `useGoals` returns no goals.
- **Returning users**: Welcome redirects a signed-in user with at least one goal to `/goals/`; Save draft returns to `/goals/` (spec 10 follow-ups).
- **Demo data**: `seed:demo --goals-list` (emulators only) adds one analysing goal with a run stuck at "checking", two drafts (one per step) and a second active goal reusing the demo analysis; `--empty-user` adds `empty@adidi.app` with no goals.

## Acceptance criteria

- Ordering and counts are correct for a seeded user with one analysing, two draft and two active goals.
- Deleting an active goal requires confirmation; deleting a draft does not; an analysing goal has no delete control.
- The banner appears and disappears according to the rule (tests with a fixed "today").
- A user with no goals sees 4a on Goals and 5a on Documents.

## Tasks

1. List with seeded goals and ordering.
2. Card variants.
3. Delete flows.
4. Banner.
5. Empty states.

## Out of scope

Sorting options, search.
