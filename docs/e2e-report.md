# End-to-end report: main on the Firebase emulators

Date: 2026-10-18. Tested commit: `ac2c1f3` (plus the README commit that followed it). Tester: coding session, driving the in-app browser.

## Environment

- Firebase emulators from `pnpm emulators` (Auth 9099, Firestore 8085, Storage 9199, project `demo-adidi`). The two stale processes (Firestore emulator pid 68997, worker pid 66066) were stopped first.
- Seeds, with the emulators running: `seed:rules`, `seed:demo`, then `seed:demo --goals-list --empty-user` (the `*:emulator` seed scripts start their own emulator on the same ports, so they cannot run next to `pnpm emulators`). Re-seeded the demo user once mid-test after deleting its month document.
- api on 8080 with `TASKS_MODE=direct`, `WORKER_URL=http://localhost:8081`, a Gemini key copied from `worker/.env` (the api's own `.env` has none); worker on 8081 with `TASKS_AUTH=off`; web on 3000 with `NEXT_PUBLIC_USE_EMULATORS=1`. Settings were passed as environment variables; no `.env` file was edited.
- Real Gemini was used for the estimate (twice), one first run (four sample PDFs) and one monthly run.
- Users: `demo@adidi.app` (seeded, five goals) and `empty@adidi.app` (no goals, used as the brand-new user). The app has no self sign-up, so "brand-new" means the seeded empty user.
- Sample PDFs were attached by script (a `DataTransfer` set on the file input), because the native file dialog cannot be driven from the pane. The upload code path (signed-URL emulation, `PUT /uploads/:id/content`) ran for real.

## Checks

| Check | Result |
| --- | --- |
| `pnpm lint` | Pass (307 files) |
| `pnpm typecheck` | Pass (shared, firestore-tests, api, worker, web) |
| `pnpm test` | Pass when the emulator ports are free: shared 251, web 117, api 120 (1 skipped), worker 222 (10 skipped), rules 26. The root `pnpm test` fails at the rules suite if `pnpm emulators` is running (it needs port 8085), so I ran the other four packages while the app was up and the rules suite after shutting it down. |
| `pnpm --filter worker e2e:emulator` | Pass in 116 s: four documents extracted, 35 transactions classified, snapshot, metrics, two actions and a headline; no files left in the bucket. |

## Screens

| Screen | Result | What I saw |
| --- | --- | --- |
| Welcome, signed out | Pass | Hero, how it works, trust points, sign-in card. Wrong password shows "That email and password do not match an account." Protected routes show "Sign in to continue". |
| Welcome, signed in | Pass | "Hi, Empty. Welcome." with the sample result card. |
| Sign-in and sign-out | Pass | Redirects to `/goals/`; sign-out returns to the sign-in gate. |
| Goals list, demo (ordering, tabs) | Pass | Analysing first, then two drafts, then two active (newest first); counts "All 5, Active 2, Drafts 2"; Drafts filter shows only the drafts. |
| Goals list, banner | Pass | With the demo user's September month deleted: "September is over: add its statements. Upload once and both active goals update." No banner when September exists. |
| Goals list, empty state (no goals) | Pass | Picker with house enabled and car and wedding marked Soon (not links). |
| Goals list, only drafts | Pass with a note | Draft card appears; see issue 6. |
| New goal, city dropdown | Pass | Five cities (Jakarta Selatan, Tangerang Selatan (Serpong), Depok, Bekasi, Bogor); missing city shows "Choose a city." and blocks Save draft. |
| Estimate card | Pass | Empty state "Rp —", then "Searching prices" (about 20 to 35 s), then the AI estimate with range, inflation line, target, sources and an editable field. Works with and without sizes. |
| Profile modal | Pass | Opens on Continue for a user with no profile; empty submit shows inline errors; income formats with dot separators; saving continues to the documents step. See issue 8. |
| Documents step (new goal) | Pass | Month selector defaults to September 2026; four PDFs uploaded to the Storage emulator; Submit opens the progress view. |
| Progress view | Pass | Four stages stepped from 18% to 100%; "See your readiness" appears at the end. Also loads without the `?run=` parameter. The seeded analysing goal's progress page renders step 3 at 71%. See issue 9. |
| Result page, first run (live Gemini) | Pass | Headline, KPR and cash path cards, seven checks, three verified actions, rules and assumptions summary. |
| Result page, demo | Pass | Same layout; commit on action 1 and dismiss on action 3 recomputed the plan line ("1 in your plan, 1 skipped"); Undo restored both. |
| Rules panel | Pass | "See the rules used" expands a table with value used, your value and effect. |
| Export PDF | Not run | The button calls `window.print()`; the pane has no print dialog. |
| Documents tab, up to date | Pass | "Your September 2026 statements are in", next upload from 1 November. |
| Documents tab, no goals | Pass | "Start with a goal" with three steps, for the user with no goals and for the user with only a draft. |
| Documents tab, check-in | Pass | `?month=2026-10` (dev only) lists last month's sources with Missing drop zones; "Add a new source"; submitting with two of four sources ran a monthly run and the result gained a "Since September" card. After it, the tab shows "Your October 2026 statements are in". See issues 2 and 3. |
| Assumptions (read-only) | Pass | Every rule grouped with value, source and checked date; footer says editing is coming soon. See issue 7. |
| Delete, draft | Pass | Removed at once, no confirmation (as specified). |
| Delete, active goal | Pass | Dialog; Escape cancels; "Delete goal" removes it; the user lands on the no-goals state. |
| Delete, analysing | Pass | No delete control, as specified. |
| Narrow screens | Pass | At 375 px width the result, goals, assumptions and new-goal pages have no horizontal overflow. |
| Console | Pass | The only errors were the 400 responses from the Auth emulator for my deliberate wrong-password attempts and the initial session lookup. |

## Open issues

None of these blocks the demo; nothing was fixed apart from one README line.

1. Known, reproduced: the KPR path card shows "Rp 9.3 m / mo" while the DTI sentence reads "KPR installment of Rp 9.6 m" (demo user), and "Rp 9.7 m" against "Rp 10.6 m" on the live run. Same as the Next item in `docs/progress.md`.
2. Carried-forward sources are not shown on the result page. After the monthly run with two sources missing, the snapshot has `estimatedSources: ["paylater"]` but nothing on the result page says so (the web code does not read the field), while `docs/screens.md` says the result is marked as estimates. Also, the missing second bank file (SakuPay) was neither carried nor listed, because the worker carries by kind (the known spec 13 follow-up 1). Repro: finish a first run, open `/documents/?month=2026-10`, add only the bank and investment files, submit, open the result.
3. The delta summary reads awkwardly: "with 0 of your 0 committed actions showing in your statements" and "down payment progress at 26% to 26%" listed as a moved check (known spec 13 follow-up 2; the unchanged check is new to this list).
4. The Assumptions page shows raw placeholders as sources: "[bank criteria, to be checked]", "[published KPR rates, to be checked]", "[BI residential property price index, to be checked]", "[money-market fund returns, to be checked]". The values behind them are unverified; fill them in before showing the page to judges.
5. Copy says users can change assumptions while the page is read-only: the new-goal info box ("You can change any of them"), the result page link ("Assumptions you can change", "Edit assumptions and see sources").
6. A draft that already has an estimate and was saved from step 1 reads "Next: calculate the target" (its `draftStep` is `estimate`), and "Saved 0 s ago" appears right after saving. Wording only; "Next: review the target" would fit. The decision about the Documents tab for a user with only drafts (spec 12 follow-up) still stands: today it shows the no-goals state.
7. The documents step and the estimate card disagree on timing: the form header says "about 30 seconds", the footer "about 20 seconds", `docs/screens.md` "about 10 seconds"; the real call took 20 to 35 s.
8. The profile modal keeps its inline errors after the field is filled, until the next submit.
9. The progress page keeps "Usually a few minutes. No need to wait here" at 100%.
10. A statement file attached to the e-wallet slot defaults its kind dropdown to Bank, so an e-wallet history is labelled Bank unless the user changes it; I did not check what the extraction does with the wrong label.
11. The seeded Bandung draft (`house-bandung`) opens with the city dropdown empty because Bandung is not one of the five cities. Only seed data can hold this, but a draft saved before the dropdown would behave the same.
12. With no earlier month at all (the demo user with its September document removed, not a state a real user can reach), the check-in says "compare September with Last month" and "Last month's numbers" with a capital L. The "Upload October" button on the result page leads to a page that says the next upload opens on 1 November.
13. README said the demo password is `demo-pass-2026`; the seed script reads `DEMO_PASSWORD` from `api/.env`, which was `adidi_cup` here, so the README password failed. README line corrected in `f290ce2`.
14. Known and still open, not re-tested: the `@google/genai` "non-text parts functionCall" log line on every agent turn (it appeared again in the e2e run).
