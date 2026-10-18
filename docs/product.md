# Product

## Problem

Indonesians pay across many banks, e-wallets and PayLater/pinjol apps. No tool answers the question they care about: "When can I afford the house, the car or the wedding, and what is stopping me?" Expense trackers record the past; goal-based investing apps only see the investment side. Neither reads pinjol and PayLater debt, which is often the biggest reason a bank would refuse a loan.

## What Readyo does

1. The user creates a goal and describes it in a few fields.
2. Gemini estimates the goal's price from that description, with sources. The user can edit the number.
3. The user uploads one month of statements (bank, e-wallet, PayLater/pinjol, investments).
4. On Submit, the pipeline extracts the data, computes seven readiness metrics, checks lending rules month by month, and builds a plan of verified actions.
5. The result shows months-to-ready on the cash path and the loan path, what blocks approval today, and the plan.
6. Every month the user uploads new statements once; all active goals are recalculated and show what moved.

## Judging context (AI Builder Cup 2026, BFSI)

Technical merit and Gen AI implementation 40%, problem alignment and impact 25%, innovation 25%, UX 10%. Judges look for Gen AI used meaningfully, not as decoration. Submission: working prototype, PDF deck, 3-minute demo video, public GitHub repo.

Demo story to protect: upload a PayLater bill → DTI rises from 34% to 37% → KPR approval blocked → the agent proposes moving the volatile assets into the down payment and paying the PayLater off → the simulator verifies both → approval moves from month 24 to this month.

## Goals

Three goal types. Each needs a pricing model (description → rupiah), a financing model (cash vs loan and its approval rules) and the readiness metrics that gate it.

### House (cash or KPR)

| Field | Notes |
|---|---|
| City or area | Drives the price lookup most |
| Property type | Landed house / Apartment |
| Land and building size (m²) | Or a budget range instead |
| Market | New (developer) / Secondary; changes DP rules |
| First home? | Decides FLPP eligibility and the DP floor |
| Target year | |
| Payment preference | Cash / KPR / No preference |
| Refine (optional) | Planned down payment; apply jointly with spouse |

### Car (cash or KKB)

Car financing is KKB (Kredit Kendaraan Bermotor), not KPR.

| Field | Notes |
|---|---|
| New or used | |
| Model, or a segment | Or a budget range instead |
| Target year | |
| Where they will buy it | City, for on-the-road price |
| Payment preference | Cash / KKB / No preference |
| Refine (optional) | Planned down payment; trade-in vehicle value |

### Wedding (savings only, no loan path)

| Field | Notes |
|---|---|
| Target date | Month and year |
| City | |
| Number of guests | |
| Scale | Intimate / Standard / Large; picks the cost-per-guest band |
| Who's contributing | Partner's share, family contribution (Rp) |
| Refine (optional) | Honeymoon: no / domestic / abroad, and budget |

The wedding target the user must save = estimated cost − partner's share − family contribution.

### Payment preference

The user states a preference, but the result always shows both paths side by side (for house and car). The preference only decides which path leads.

### Profile (asked once, not per goal)

Age, employment type (permanent / contract / freelance), net monthly income (inferred from statements, then confirmed), marital status and dependents, spouse income if married, city. Existing debts are not asked: they are inferred from statements and shown for confirmation.

## Goal lifecycle

`draft` → `analysing` → `active`

- **Draft**: created but not submitted. Tracks the next step: "calculate the target" or "add documents". Can be resumed or deleted without confirmation.
- **Analysing**: submitted; the pipeline is running. Cannot be deleted. Its progress shows on the goals list and on the full-screen progress view.
- **Active**: analysed at least once, tracked monthly. Can be deleted, with a confirmation step, because it removes tracked history.

## Data ownership

Statements belong to the **user**, not to a goal.

- One monthly upload updates every active goal.
- A new goal created when the latest month is already submitted reuses that month's extracted data: no upload step, analysis takes about 20 seconds. If the latest data is older than about 45 days, ask for a fresh upload instead.
- Deleting a goal deletes that goal's analyses only; transactions, loans and holdings stay for the other goals.
- No uploads are possible before the user has at least one goal (the first statements always arrive through the goal flow).

## Monthly cycle

From the 1st of month M+1, the goals list shows a banner inviting the user to add month M's statements. It stays until month M is submitted. No reminders or notifications. The check-in screen lists last month's sources so the user knows what to upload; missing sources carry the previous month's numbers forward and are marked as estimates.

## Privacy

- Raw files are deleted from Cloud Storage right after extraction. Only structured numbers are kept.
- Account and card numbers are masked before storage.
- The user can delete all their data at any time.
- Read-only: no banking passwords, no ability to move money.

## Out of scope (hackathon)

Master's degree goal, cash-spending note uploads, alternatives after a skipped action, check-in reminders, bank/e-wallet API sync (SNAP BI comes later), mobile app, couples' shared goals, cross-goal budget allocation (each goal is analysed independently; noted as a known limitation).
