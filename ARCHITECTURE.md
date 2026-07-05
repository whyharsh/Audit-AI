# ARCHITECTURE.md - Audit Evidence Engine

Companion to BRIEF.md. BRIEF.md says why; this says how. No timelines here; ordering is by dependency, not by date. Vocabulary is load-bearing: TransactionGraph, Provenance, EvidenceTrail, Seal. Do not introduce synonyms in code.

Governing decision: this is a deterministic audit evidence pipeline first, SaaS app second. The core is a pure TypeScript engine runnable from CLI, tests, or the web app. The UI wraps the engine and never owns logic.

---

## 0. Repo Shape

Monorepo, pnpm workspaces.

```text
/packages
  /engine          pure TS, zero I/O side effects, no framework imports
    /types         core domain types, shared everywhere
    /ingest        parsers: tally-xml, tally-editlog, synthetic
    /graph         TransactionGraph construction + provenance enforcement
    /controls      control definitions + execution runtime
    /trail         EvidenceTrail assembly
    /seal          manifest, merkle, signing, verification
    /export        workpaper JSON model + renderers (HTML -> PDF)
  /db              schema, migrations, RLS policies, typed client
  /cli             run engine end-to-end from terminal: ingest -> run -> export
/apps
  /web             Next.js: upload, review, sign-off, export download
/fixtures
  /synthetic       generated datasets with planted defects, also the test suite
BRIEF.md
ARCHITECTURE.md
AGENTS.md
```

Rules: `engine` never imports from `db` or `apps`. It takes plain data in, returns plain data out. Persistence adapters live at the edges. The CLI is the reference harness and the demo device; if it cannot run headless, the architecture has failed.

---

## 1. System: Artifact Intake

Purpose: get raw files into custody before anything reads them.

Flow: receive file -> SHA-256 the bytes -> write to object storage under `firm_id/engagement_id/{hash}` -> insert `artifacts` row -> only then hand to parsing. Hash is identity; re-upload of identical bytes is a no-op that returns the existing artifact.

Properties:
- Artifacts are write-once. No update path exists in code. Storage bucket policy denies overwrite.
- Every artifact records content hash, byte size, declared type, detected type, uploader, engagement, and received-at.
- Parsing status lives on the artifact: received -> parsed -> failed(reason). A failed parse is visible state, never a silent drop.

## 2. System: Ingestion (Tally First)

Purpose: turn artifacts into candidate facts with full lineage.

Parsers are versioned pure functions: `(artifactBytes, artifactHash) -> { facts: CandidateFact[], errors: ParseIssue[] }`. Parser version is part of every fact's provenance. Changing a parser bumps its version; old facts keep old versions.

v0 parsers:
- `tally-xml`: Day Book vouchers, ledger masters, party masters, voucher lines.
- `tally-editlog`: alteration events, including voucher id, timestamp, user, field-level before/after where available, and feature on/off state changes.
- `synthetic`: reads fixture definitions; exists so the engine has a parser-shaped source for tests and demos.

Every CandidateFact carries a SourceLocation: XML path for Tally, row/cell for tabular, page and bbox reserved for future OCR. No fact without a location.

Amounts are integer paise everywhere. No floats anywhere in the engine. Dates are ISO strings interpreted in the engagement's declared timezone; the engagement stores its financial year bounds explicitly.

## 3. System: TransactionGraph

Purpose: the client's financial reality as canonical, queryable facts. This is the object under audit; it may be wrong, and that is the point.

Entities, each a table and each a type: Account, Party, Voucher, VoucherLine, EditLogEvent, Document. Relations are foreign keys plus a typed `graph_edges` table for cross-entity links that are not natural FKs, such as voucher-document and voucher-bank-line later.

Provenance enforcement, three layers deep:
1. Types: constructors in `engine/graph` require a Provenance argument; there is no way to build a graph fact without one.
2. Code: the persistence adapter refuses inserts lacking a provenance record id.
3. Database: NOT NULL FK from every graph table to `provenance_records`, plus a CHECK that parser_version is non-empty.

Provenance record fields: artifact_hash, source_location, parser name and version, derivation. `artifact_hash` is an FK to artifacts by hash. `source_location` is jsonb. Derivation is null for primary facts; for derived facts, it records the algorithm pass id and input fact ids.

Supersession, not mutation: graph tables are append-only. A corrected fact is a new row with `supersedes` pointing at the old one; queries default to the head of each supersession chain. Re-ingesting a corrected Tally export creates new facts superseding old ones under a new ingestion run id.

## 4. System: Controls Engine

Purpose: deterministic testing of the full population.

A ControlDefinition is data plus one pure function:
- id, semver version, title
- assertion: existence | completeness | cutoff | authorization | valuation | integrity
- populationQuery: a declarative spec, serialized into the run record so the population is re-derivable
- test: `(population, params, context) -> RawFinding[]`, pure, no I/O, no clock reads
- evidenceRequirements: which fact fields and related entities the trail must capture
- exceptionRateCap: fraction above which the run halts as MISCONFIGURED

The engagement's period bounds and an explicit `asOf` come in via context.

v0 control set:
1. editlog-disabled-period: edit-log feature off or absent for any interval in the FY.
2. editlog-gap: activity gaps inconsistent with voucher posting activity, where posting continued while log was silent.
3. duplicate-payment: same party plus amount plus near date across payment vouchers; ordered deterministic passes, exact then windowed.
4. cutoff-yearend: vouchers dated in-period with evidence dates out-of-period and vice versa, window parameterized.
5. manual-journal-risk: journal vouchers meeting risk predicates, including round amounts, period-end clustering, and sensitive ledger heads. Thresholds are versioned params, not magic numbers.

Execution model: a ControlRun = (control id, control version, params hash, population snapshot spec, ingestion run id). Runner executes in-process for v0; the fan-out/reduce boundary is an interface so Inngest can slot in later without touching control code.

Finding statuses:
- PASS_SUMMARY: population tested, nothing to report, with counts.
- EXCEPTION: a specific violation with fact refs.
- UNTESTABLE: control could not run; names the missing data.
- MISCONFIGURED: breaker tripped.

UNTESTABLE is a first-class, reportable, exportable finding. Silence is forbidden.

Determinism specification:
- Canonical JSON serialization: sorted keys, no whitespace variance, integers only for money, fixed date format.
- All sorts have total order with documented tiebreakers, for example voucher date, then voucher number, then fact id.
- No Date.now(), no Math.random(), no locale-dependent formatting inside the engine.
- Finding ids are content hashes of their canonical serialization, so identical findings across runs have identical ids.
- CI enforces it: the determinism test runs every control twice on fixtures and byte-compares output.

## 5. System: EvidenceTrail

Purpose: the replayable derivation of every conclusion. The TransactionGraph is the evidence; the trail is the argument.

One table: `evidence_trail_nodes`, append-only, typed. Node types: CONTROL_RUN, POPULATION, FACT_REF, FINDING, REVIEW, OVERRIDE, SIGN_OFF, SUPERSESSION. Edges live in `evidence_trail_edges` with typed relations: tested-by, evidenced-by, derived-from, reviewed-by, supersedes.

There is no separate `review_actions` table. Review actions are trail nodes of type REVIEW, OVERRIDE, or SIGN_OFF. The review UI writes trail nodes directly. One source of truth; the review log any screen shows is a projection query.

Trail invariants:
- Every FINDING node reaches, transitively, only FACT_REF nodes whose facts carry provenance. Enforced by construction: trail assembly walks the finding's fact refs and refuses unknown ids.
- OVERRIDE nodes require reason text, materiality justification, actor, and the finding they act on. Reason text must be non-empty and meet minimum substance checks. Override quality is a product feature, not a formality; a sealed file showing a careless override is worse than no file.
- Nothing is ever deleted or edited. Corrections supersede.

Replayability contract: given artifacts, ingestion run id, control id and version, and params, anyone can re-execute and reproduce the identical FINDING nodes. The CLI exposes `replay <finding-id>` as the proof.

## 6. System: Seal

Purpose: make the file non-repudiable. Supporting trust layer, not the headline. Inspectors verify to SA 230, not to Merkle roots; the seal's near-term value is persuasive, and the design must be honest about that.

Manifest: canonical serialization of artifact hashes, all trail node hashes, all edge hashes, and export bundle hash -> Merkle tree -> root. Sign root with firm key, Ed25519. Anchor with RFC 3161 timestamp. Store manifest, signature, and timestamp token in `seals`.

Seal points: fieldwork-complete, review-complete, sign-off. Each seal references the prior seal's root, forming a chain across milestones.

Verification: a pure function shipped in `engine/seal` and exposed via CLI `verify <bundle>` and a public web endpoint. Verification recomputes from the bundle contents alone; trusting our database is not required.

Key management v0: one keypair per firm, private key in server-side KMS or secret store, never in the browser. Documented rotation procedure before first external pilot.

## 7. System: Interaction Layer (Web App)

Purpose: the partner's surface. Thin over the engine. Two modes sharing one engine.

### 7a. Compelled Mode

The wedge; build first.

Screens:
- engagement dashboard: artifact custody status, run statuses
- exception queue: sorted by materiality, filterable by control and status, UNTESTABLE prominent and never buried
- finding drill-down: finding -> facts -> provenance -> source artifact viewer, the two-click promise
- override flow: structured reason, materiality, preview of how it renders in the workpaper, so the partner sees what the inspector will see before committing
- sign-off: summary of open items; blocked while EXCEPTION findings lack disposition; triggers seal

### 7b. Exploration Mode

Prompt-driven; build after compelled mode ships.

The user asks in natural language, for example "show me all round-sum journals near year-end posted by this user", or picks a rule from the library. The LLM compiles the prompt into a population query plus a deterministic predicate; the compiled query is displayed to the user before execution; the same controls runtime executes it. The LLM translates the question, the engine answers it. The invariant holds in both modes: LLM proposes, deterministic execution disposes.

Every exploration produces a new EvidenceTrail alongside the compelled ones. Trails are never reshaped around a prompt; a prompt generates a fresh derivation. The append-only invariant is load-bearing for the seal. Including or excluding an ad hoc trail from the sealed file is an explicit, recorded professional judgment.

Lenses: prompts also readapt the view, never the data. The compiled query drives the canvas: nodes on the answer's path highlight, everything else dims, grouping and ordering reproject around the question so the user immediately understands what they are looking at. A lens is a saved view specification over immutable trails. It can include filter, highlight, and layout params. Lenses can be named and reused like bookmarks, and are strictly presentation-layer, never serialized into the sealed bundle as facts.

Promotion loop: an exploration query that proves useful is promoted, one click, into a named, versioned ControlDefinition in the firm's library. Exploration is how the control library grows; auditors author the rulebook by asking questions. Promoted controls get semver, params, and an exceptionRateCap like any hand-written control.

### 7c. Layered Navigation Model

Applies to both modes.

The UI presents the system as three storeys, navigated by clicking down through nodes:
- Top: EvidenceTrail graph, the argument made of rules, findings, reviews, and sign-offs.
- Middle: TransactionGraph, the mechanism made of vouchers, parties, accounts, and edit-log events beneath any trail node.
- Ground: source documents, the artifact viewer opened at the exact provenance location.

Choosing a rule takes the user on the journey of that rule: control definition -> population it selected -> facts it examined -> exceptions it raised -> the documents behind them. Same z-axis descent everywhere; this drill-down is the product's signature interaction.

Tenancy: Supabase Postgres RLS on every table keyed by firm_id, enabled in the first migration, not retrofitted. Storage bucket policies mirror it. Client financials plus DPDP make tenancy bugs fatal.

## 8. System: Workpaper Export

Purpose: the deliverable.

Model first: a WorkpaperBundle JSON: engagement metadata, control run summaries, findings with dispositions, trail references, seal manifest. Renderers consume the model: HTML template -> PDF. PDF rendering uses headless Chromium; fonts are installed via fontconfig from raw GitHub URLs, not Google Fonts CDN, per known render-pipeline constraint. PDF embeds the verification QR pointing at the verify endpoint with the root hash.

Sections: cover and engagement identity, Rule 11(g) evidence pack, per-control test summaries with population definitions, exception register with dispositions and override reasoning, UNTESTABLE register, seal certificate page. The Rule 11(g) evidence pack is the wedge deliverable and should be its own self-contained section.

Every rendered sentence traces to a bundle field; the renderer has no access to raw data, only the model. When LLM narrative drafting arrives later, it drafts from the bundle model under the same constraint and its output is diffable against a deterministic fallback template.

## 9. System: Synthetic Dataset (Fixtures)

Purpose: test suite, demo dataset, and parser spec in one artifact. Built before the real parser.

Generator produces a fictional company: configurable voucher volume, parties, ledger structure, a full FY of activity, an edit log, plus a defect manifest. Planted violations include an edit-log disabled window, a log gap during active posting, two duplicate payment pairs, three cutoff violations, and a cluster of round-sum period-end journals. CI asserts the engine finds exactly the manifest: no misses, no extras.

Demo narrative: "we planted seven defects; watch it catch seven, and here is the sealed trail for each."

## 10. Database Schema (Consolidated)

Tenancy and identity:
- firms
- users
- clients
- engagements, with FY bounds, timezone, and materiality params

Custody:
- artifacts
- provenance_records
- ingestion_runs

TransactionGraph:
- accounts
- parties
- vouchers
- voucher_lines
- edit_log_events
- documents
- graph_edges

Controls:
- control_definitions, seeded from code and versioned
- control_runs

Trail:
- evidence_trail_nodes
- evidence_trail_edges

Findings are nodes; a findings view projects them for query ergonomics.

Seal and export:
- seals
- workpaper_exports

Cross-cutting constraints: provenance FKs NOT NULL on all graph tables; append-only enforced by revoking UPDATE and DELETE on graph and trail tables from the app role; supersedes self-FKs on graph tables; RLS by firm_id everywhere.

## 11. Dependency Order Of Construction

Order, not time.

1. `engine/types`: the six core types: TransactionGraph entities, Provenance, ControlDefinition, Finding, EvidenceTrail nodes, Seal manifest. Everything else imports these.
2. Synthetic generator plus defect manifest. Fixtures exist before any parser.
3. `tally-xml` and `tally-editlog` parsers, validated against synthetic-exported and real sample Tally data.
4. Graph construction with provenance enforcement; db schema and RLS migration.
5. Controls runtime plus the five controls plus determinism CI test.
6. Trail assembly plus replay CLI command.
7. Export bundle model plus HTML/PDF renderer with 11(g) pack.
8. Seal plus verify, CLI and endpoint.
9. Web app: upload -> queue -> drill-down -> override -> sign-off, wrapping all of the above.

The CLI must complete the full path, ingest fixtures -> run controls -> export sealed bundle -> verify, before the web app exists. That is the architecture's acceptance test.

## 12. Explicit Non-Goals For v0

No graph database. No chatbot. No proof assistant. No LLM in any decision path. No bank statement parsing. No GST reconciliation. No fraud analytics. No coverage checker. Exploration mode is post-v0: compelled mode must ship and seal first. No blockchain, ever.
