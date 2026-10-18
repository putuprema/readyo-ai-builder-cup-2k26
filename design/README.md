# Design

Put the design handoff bundle (or the exported HTML files) in this folder.

The canvas has these artboards. Their behavior is described in `docs/screens.md`; the matching UI specs are in `specs/10`–`specs/13`.

| Artboard | Screen |
|---|---|
| 0 | Welcome |
| 1, 1b, 1c | New goal: house, car, wedding |
| 2 | Documents (first goal) |
| 2b | Analysis in progress |
| 3, 3a | Readiness result; rules panel collapsed vs expanded |
| 4, 4a | Goals list; no goals yet |
| 5, 5a | Monthly check-in; documents with no goals yet |
| 6 | Second goal: reuse this month's data |
| 7 | Assumptions |

The mockups hard-code some states (selected options, sample numbers). Build real state, and treat every number as sample data. The sample numbers are not internally consistent; tests use the fixtures defined in the specs.
