# Bright Ledger FY2025

This is a fictional audit engagement for Bright Ledger Components Private Limited. It is meant to become the first synthetic test pack for the engine.

The fixture covers FY 2024-25, timezone `Asia/Kolkata`, and uses integer paise for money. It is intentionally small enough to inspect by hand, but it includes normal transactions around the planted defects so future controls must select populations instead of matching hard-coded voucher numbers.

Files:

- `manifest.json`: engagement metadata, control list, planted defects, and source file descriptions.
- `artifacts/tally-daybook.xml`: Tally-shaped masters and vouchers.
- `artifacts/tally-editlog.json`: edit-log feature state changes and voucher alteration events.
- `artifacts/source-documents.json`: invoice, bill, and goods-receipt metadata used by cutoff tests.
- `expected-findings.json`: the expected exception set for deterministic tests.

Expected exception findings:

- one edit-log disabled period
- one edit-log silence gap during posting activity
- two duplicate payment pairs
- three year-end cutoff exceptions
- one period-end round-sum journal cluster

Future engine tests should ingest the fixture, run the five v0 controls, and compare the exception findings with `expected-findings.json`. The first acceptance target is exact match on control id, source refs, status, and severity.

