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
