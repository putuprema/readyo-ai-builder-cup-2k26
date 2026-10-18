# Fixtures

Test inputs for the pipeline. Never commit real account numbers or names.

- `statements/`: real statements from the team, anonymised (names and account numbers blacked out, amounts kept). Target set for the first milestone: one bank e-statement PDF (e.g. BCA), one e-wallet history screenshot (e.g. GoPay), one PayLater bill screenshot, one investment portfolio screenshot.
- `expected/`: for each statement, the JSON you expect extraction to return, written by hand. Used by the extraction accuracy tests in `specs/04-extraction.md`.
- `profiles/`: hand-made financial profiles used by `simulate()` tests (`specs/02-simulate.md`).
