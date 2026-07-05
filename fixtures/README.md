# Fixtures

This folder holds fictional data for building and testing the audit evidence engine.

The fixture rule is simple: every planted defect must be named in a manifest, tied to source records, and reflected in expected findings. That lets the engine prove it found the known defects without silently inventing extras.

Current fixture:

- `synthetic/bright-ledger-fy2025`: small Indian company ledger for FY 2024-25, with Tally-shaped vouchers, edit-log events, source document metadata, and expected exceptions for the first five controls.

