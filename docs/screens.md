# Screens

Each section matches an artboard in `design/`. Numbers in the mockups are sample data. Where a mockup hard-codes a state (a selected option, an open panel), build real state.

## Global

- **Header**: logo + [APP NAME], nav tabs Goals · Documents · Assumptions, user avatar.
- **Tab highlight**: a tab looks selected only on the list page it stands for (Goals list, Monthly check-in, Assumptions). In the goal-creation flow and on the result page, no tab is highlighted; the step chips are the "you are here" indicator.
- **Step chips** in goal creation: 1 Goal · 2 Documents · 3 Readiness, done steps shown with a check.

## 0 · Welcome (first visit)

Headline about how far you are from the house, the car or the wedding; a short explanation; **Create your first goal** (→ New goal); "Takes about 3 minutes. No bank login needed." A sample result card on the right shows the shape of the output. Below: "How it works" (3 steps) and three trust points (PayLater counts, every number has a rule, files are deleted). If the user is not signed in, replace the greeting and avatar with sign-in.

## 4a · Goals list, no goals yet

Title "Your goals", one card: "No goals yet", one-line explanation, three tiles (house, car, wedding) that open the goal form with that type preselected, **Create your first goal**, and a note on what they'll need. No upload banner, filters or New goal button. The **Delete all my data** footer (below) stays, since a profile, months or assumption changes can exist without goals.

## 4 · Goals list

- Header: "Your goals", subtitle with counts (e.g. "1 being analysed, 2 drafts to finish, 2 active and tracked monthly"), **New goal**.
- **Monthly banner** (amber): shown from the 1st of month M+1 until month M is submitted. "October is over: add its statements. Upload once and both active goals update…" → Monthly check-in. No due date, no reminders.
- Filter tabs: All · Active · Drafts, with counts.
- **Order**: analysing first, then drafts, then active.
- **Analysing card**: green outline, pulsing "Analysing" tag, current stage ("Step 3 of 4 · Checking the rules") and an animated progress bar, submitted time and time left, **Watch progress** (→ progress view). No delete. Reads the same run status document as the progress view. No spinner around the icon.
- **Draft card**: dashed outline, "Draft" tag, summary of inputs, "Saved X ago", next step text and a 3-segment progress bar, delete (no confirm), **Continue** resuming at the right step.
- **Active card**: "Active" tag, summary, one-line blocker or status in red/amber, the headline number (e.g. "14 mo to a KPR with the plan" or "2 mo late"), data month, delete (with confirmation), **View** (→ result page).
- **Footer**: a quiet underlined text button **Delete all my data** (`docs/product.md`, "Privacy"). It opens a confirmation dialog listing what goes (profile; every goal with its results and plan; the statements' numbers and any stored files; assumption changes) and saying the sign-in stays and it cannot be undone; **Keep my data** / **Delete everything**. `DELETE /me/data` does the work; while an analysis runs it is refused and the dialog says so. On success the list falls to 4a and a status line says "All your data was deleted."

## 1 · New goal (house), 1b · car, 1c · wedding

- Goal picker: three cards; the selected one has a green 2 px border and soft ring. Selecting switches the form below.
- Form fields per goal: see `docs/product.md`. Optional fields sit in a collapsed "Refine (optional)" section.
- **Sample scenario**: a new house goal starts filled in (`web/lib/sample.ts`: Tangerang Selatan (Serpong), landed, 90 m² land / 70 m² building, new, first home, 2028 or the first year offered, KPR), with a small muted note under the form heading: "Filled in with a sample scenario. Change anything to match your own." Every field stays editable. A resumed draft (`?id=`) shows its own values. Together with the pre-filled profile modal, a new goal takes three clicks: Calculate Estimate, Continue, Save and continue.
- **Profile modal** (on Continue, only when the user has no profile): opens pre-filled with the sample profile that matches the sample statements' household (29, permanent, Rp 15.000.000 net a month, single, no dependents, Tangerang Selatan) and a muted note that it is a sample profile.
- Radio options are chips; the selected chip gets the green border and tint (the mockup hard-codes this; make it follow the selection).
- House and car: "How would you prefer to pay?" grey box, with the note that both paths are shown either way. Wedding: "Who's contributing?" grey box instead (partner's share, family contribution), no payment preference.
- **Calculate Estimate** button at the foot of the form, with a note that it searches current prices, takes about 30 seconds (measured 20 to 35 s on Flash with Search grounding), and should be rerun after changes. Never estimate automatically on input change.
- **Estimate card** (right column), three states:
  - *Empty*: dashed card, "Rp —", hint to press Calculate Estimate. **Continue** is disabled.
  - *Fresh*: editable price field ("Edit if you know a better number"), range seen, growth assumption → target at goal date, "Calculated X ago from: …", sources with dates. Wedding also shows the contribution split ("Partner Rp 50 m + family Rp 60 m → you save Rp 100 m").
  - *Stale*: as fresh plus an amber banner "You changed the details. This number is from the previous inputs." with **Recalculate**. Detected by comparing current inputs with the stored `inputsUsed`; no model call.
- Info box under the estimate pointing to Assumptions (loan rules for house/car; "no loan path" for wedding).
- Footer: **Save draft** (→ goals list), **Continue to documents**. If this month's data already exists, Continue goes to 6 instead of 2.

## 2 · Documents (first goal)

- Eyebrow "Step 2 of 3 · {goal summary}", title "Add your last 1–2 months", note that nothing is read until Submit and originals are deleted.
- Three upload cards: Bank and e-wallet statements · Pinjol and PayLater statements (full width row with bank) · Investments and savings (full width below). No cash-notes upload.
- File rows show only name, type and size, plus remove. **No AI reading at this step**: no extracted counts before Submit.
- **Use sample statements** (secondary button under the month picker, with a one-line note): fetches the four synthetic September 2026 statements (`web/public/samples/`, committed copies of `fixtures/statements/sample_*.pdf`) and adds them as if picked: bank and e-wallet to the first card, PayLater to the second, investments to the third, through the same upload path, progress and errors as a manual pick. It sets the month to September 2026 when that month is offered. Enabled only while no file is added. The user still presses Submit.
- Footer: "{n} files added · ready to submit", "Analysis starts when you submit. Originals are deleted once it finishes.", **Back**, **Submit** (→ 2b).

## 6 · Second goal: reuse this month's data

Shown at step 2 when the latest month is already submitted and recent. Title "Your {Month} statements are already in", card listing the processed sources with what was extracted (allowed here because it was processed earlier), "also used by {other goals}", note that analysis takes about 20 seconds. Collapsed "Something changed since {date}?" lets the user add a file, with a warning that the other goals are re-checked too. **Back**, **Submit**.

## 2b · Analysis in progress

Full-screen dark hero. Big headline that changes per stage, a supporting sentence, a ring with the percentage, an animated striped progress bar, four stage chips (Reading → Cleaning up → Checking the rules → Building your plan; done / active / to do). Driven by the run status document in Firestore. Footer: "Usually 1–2 minutes. No need to wait here…", **Go to my goals** (always visible), **See your readiness** (appears when done). Respect reduced motion.

## 3 · Readiness result

- Eyebrow with goal summary and target; headline in plain language ("You're 14 months from a KPR, if you clear the PayLater first"); data month; **Upload {next month}** (→ check-in) and **Export PDF**.
- **Two path cards**: loan path (leading if preferred) with months with/without the plan, DP needed, the installment today (month 0 of the no-change path, the same figure as the DTI check), and a red "Blocked by" strip; cash path with years with/without the plan and progress. Wedding has a single savings path.
- **Readiness checks** table: the seven metrics with You · Rule · Status (Passes / Needs work / Blocks) · What it means.
- **The plan**: up to three numbered action cards. Each: title, green impact line directly under the title, description, chips. Line under the section title updates with choices.
  - *Undecided*: **I'll do this** / **Not for me**.
  - *Committed*: green 2 px outline, line "We'll check this in your {next month} statements and tell you if it happened", **Undo**. No badge.
  - *Skipped*: collapsed dashed muted card, "Skipped" tag, what is lost ("Without it, approval moves back 8 months"), **Undo**. No alternatives.
- **Also considered** card: one line listing options the simulator rejected, with **See the rules used**.
  - *Collapsed* (default): just the line and the button with a down chevron.
  - *Expanded*: button reads **Hide the rules**, chevron flips, table "Rules checked for this goal": Rule · Value used · You · Effect on your plan (blocking rows in red), and a link to Assumptions.
- Bottom: "Assumptions we used" (key values, link "See every assumption and its source" to the read-only Assumptions page) and "Next check-in" ("Upload {month}'s statements any time from 1 {next month}…"). No reminder setting.

## 5 · Monthly check-in

- Eyebrow "Monthly check-in · {Month} {Year}" (no due date), title "Add your {Month} statements", note that one upload updates every active goal.
- "Updates" row: chips for each active goal with its current headline.
- "Same sources as last month" table: Source · last month (what it contained) · this month (file row, or an amber dashed "Missing" drop zone). Counter "x of y added".
- "Add a new source" drop zone, and a note that missing sources carry last month's numbers forward and are marked as estimates.
- Footer: "{n} files added · updates {k} goals", **Cancel**, **Submit** (→ 2b).

## 5a · Documents, no goals yet

Documents tab selected. "Start with a goal": statements are added while creating a goal; this page is for the monthly check-in afterwards. Three-step strip, **Create your first goal**. No drop zones.

## 7 · Assumptions

- Intro: every number the analysis assumes instead of reading from statements, each with a source; edits recalculate active goals.
- **Pending-changes banner** (amber) when values are edited but not applied: "{n} change not applied yet", **Discard**, **Recalculate {k} active goals**.
- **Lending rules** table: Rule · Value (editable, with unit) · Used for · Source · checked date. An edited row gets an amber outline and "Edited · default X · Reset".
- **Prices and rates** and **Savings returns** lists.
- Footer: "Your edits apply only to your account…", **Reset all to defaults**.
