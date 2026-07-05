# AUDIT-EVIDENCE-AI — Project Brief

Place this file at the repo root (C:/dev/audit-evidence-ai/BRIEF.md or AGENTS.md). It is the onboarding context for any AI coding assistant and any human joining the project. Read fully before writing code.

Status: pre-validation. Built during EF hackathon sprint, July 2026. Nothing below is settled except the invariants.

---

## 1. The problem, exactly

An Indian audit partner signs a legal opinion on a company's accounts after their team has manually checked roughly 30 transactions out of hundreds of thousands. The signer is now personally liable: NFRA orders fine and debar individual partners, ICAI peer review inspects files, MCA Rule 11(g) requires the auditor to attest annually that the client's accounting software edit log ran untampered, and Section 271J attaches personal penalty to incorrect certified reports. Inspections repeatedly find the same failure: insufficient evidence, inadequate documentation.

The acute customer: the signing partner at a 5-50 person CA firm, in September, with 40 tax audits, five overworked associates, and a signature that carries personal ruin.

## 2. The core insight

Everyone building audit automation (CORAA, MindBridge, the cluster of Indian tools) sells efficiency: save associate hours. But the buyer is a signer with personal liability, and signers pay for defensibility, not speed. The product is the tamper-evident evidence file that survives inspection. The AI testing is merely the engine that produces it. Determinism is a feature the market explicitly lacks: probabilistic AI outputs that vary between runs are a documentation liability in front of a regulator.

Secondary insight: the MCA audit trail rule solved the company's side (Tally ships edit logs) but nobody tooled the auditor's side, the mandatory annual verification of those logs. That is a named, compelled, recurring, untooled procedure. It is the wedge inside the wedge.

## 3. What we sell, in order

1. v0 wedge: Rule 11(g) edit-log verification module plus 100% transaction testing against ~15 codified controls, outputting sealed, inspection-ready workpapers. Priced per audit. Sold to mid-tier CA firms before and during tax audit season.
2. Expansion: statutory audit coverage, CARO clauses, internal audit, bank audits, due diligence. Same engine, more codified controls.
3. Venture paths (pick one deliberately, do not drift): (a) AI-native audit practice capturing the audit fee itself, not a tool fee; (b) same engine into US/UK where PCAOB/FRC run the identical signer-liability playbook at 50x pricing. India is the proving ground because audit is compelled for every registered company and CA firms are reachable in days.

## 4. What this is NOT

- Not formal verification of reasoning. Pramaana Labs ($27M, Khosla/Accel, Lean-based) proves reasoning over codified rules is correct. We prove work was performed on real data and the file is intact. They prove logic; we prove work. Never claim "formal proofs" in any copy or pitch. Say: deterministic testing, tamper-evident evidence.
- Not an efficiency tool. Never lead with time savings in product copy.
- Not a chatbot. No conversational surface in v0.

## 5. The four-object model (vocabulary is load-bearing, use it consistently)

Bottom to top:

1. **Transaction graph** — the client's financial reality reconstructed as a network. Nodes: vouchers, parties, accounts, documents. Edges: financial relations (invoice-to-payment, book-to-bank match, book-to-GSTR match, party links). This is the object under audit. It can be wrong; that is the point.
2. **Provenance records** — metadata on every fact in the transaction graph: source artifact content-hash, location within it (XML path / cell / page+bbox), extractor version, and for derived facts, the algorithm pass and input facts. Answers "why does the system believe this."
3. **Evidence trails** — the replayable derivation of one audit conclusion: the versioned control executed, the population query, every fact examined (with provenance), the finding, and every human action on it (review, override with mandatory reason, sign-off) as append-only nodes. The transaction graph is the evidence; the trail is the argument. Trails form a DAG whose leaves are transaction-graph facts.
4. **The seal** — Merkle tree over all artifact hashes, findings, and graph edges; root signed (Ed25519, firm key) and anchored via RFC 3161 timestamp. Proves the file existed at time T and is unchanged. Does not prove conclusions are correct; proves the file is honest. No blockchain.

Future layer (v1, not now): a coverage checker between trails and seal, a formalized spec of what the standards obligate an engagement to contain, checked exhaustively at seal time. Machine-checkable thoroughness. Do not build until wedge revenue exists.

## 6. Architecture (execution order = build order)

1. **Sources**: Tally XML/ODBC (vouchers, masters, edit log), bank statements (PDF/XLSX), GST portal JSON (GSTR-1/2B/3B), Form 26AS, scanned documents. MVP is Tally-only. Edit log is a first-class source.
2. **Ingestion**: SHA-256 every artifact on receipt, before any processing. Immutable object storage, encrypted, per-firm keys. Template parsers for known formats; format detector routes unknowns to LLM parsing.
3. **Normalization**: canonical schema (Entity, Account, Voucher, Line, Document, Party, Period). INVARIANT: no provenance, no persist. A field without full lineage is rejected at the schema boundary. Expect 70% of total engineering effort here; Indian data plumbing is the unglamorous moat.
4. **Extraction quarantine** (the only nondeterministic data-in zone): vision-model OCR, dual-pass LLM extraction with field diff, structural validation (totals sum, GSTIN checksum, dates parse), human review queue for low-confidence fields. Failures become explicit downstream findings ("control X untestable, evidence Y unreadable"). Silence is forbidden.
5. **Controls engine**: declarative versioned rule library. Rule = id, assertion type (existence/completeness/cutoff/authorization/valuation), population selector, test fn, evidence requirements. Full-population execution via job fan-out and reduce. INVARIANT: same data + same rule version = byte-identical findings. Per-control exception-rate circuit breakers (a control flagging 40k exceptions is misconfigured, halt and alert). This engine is structurally a backtesting engine; build it like one.
   v0 control set (~15): edit-log gap/disable detection (Rule 11(g)), top Form 3CD clauses, cutoff tests, duplicate payment detection, e-invoice IRN matching, bank reconciliation residuals.
6. **Evidence graph**: append-only DAG in Postgres adjacency tables (no graph DB). Corrections are supersession nodes, never mutations.
7. **Sealing**: Merkle + Ed25519 + RFC 3161 at milestones (fieldwork complete, review complete, sign-off). Public verification endpoint that recomputes from the file.
8. **Outputs and review app**: workpaper generator (lead schedules, test summaries, 11(g) evidence pack) as PDF with verification QR plus JSON sidecar. LLM drafts narrative FROM structured findings only; every sentence cites graph nodes. Partner UI: exception queue by materiality, two-click drill from conclusion to source pixel, accept/override with mandatory reasoning, sign-off triggers seal.

Key algorithms: entity resolution (block on GSTIN/PAN, token-set fuzzy match, ambiguous band to review queue); reconciliation as ordered deterministic passes (exact match, windowed match, bounded combination/subset-sum match, residuals flagged), each match recording its pass; graph queries for flows and cycles (SCC for circular trading) deferred past v0.

## 7. Stack

Next.js 15, React 18, TypeScript, Tailwind, Supabase (Postgres, auth, firm-level tenancy from day one), object storage encrypted per firm, Inngest for pipeline orchestration, Vercel. LLMs swappable by design: cheap/fast model for extraction, stronger model for narrative. Deterministic engine in TypeScript; port hot paths only if profiling demands.

## 8. Invariants (violating any of these is a design bug, not a tradeoff)

1. Hash before processing. Raw artifacts are write-once.
2. No provenance, no persist.
3. LLM proposes, deterministic validation disposes. LLMs never decide pass/fail on a control and never write directly into the transaction graph.
4. Evidence graph is append-only. Supersede, never mutate.
5. Untestable is a reportable state, never silence.
6. Determinism in the controls engine: identical inputs yield byte-identical findings.
7. Firm-level data isolation everywhere. Client financials + DPDP means tenancy bugs are fatal.

## 9. Build order (six weeks to pilotable)

Wk 1-2: Tally ingestion (XML + edit log), immutable store, canonical schema with provenance.
Wk 2-4: controls engine with 15 controls, evidence graph, findings pipeline.
Wk 4: sealing layer (days of work, most of the pitch).
Wk 4-6: workpaper PDF output, minimal review app (queue, drill-down, override, sign-off).
Defer: full extraction quarantine machinery, bank-format long tail, fraud analytics, coverage checker.

Demo cut (hackathon): Tally XML parser, five controls, findings table with document links, hash-chained PDF out, synthetic dataset with planted violations (a seeded edit-log gap, a cutoff violation, a duplicate payment) so the system provably catches known errors.

## 10. Data strategy

Public platforms (MCA portal, Tofler, Probe42, screener.in) provide filed statements only, useful for ingestion testing, never ledgers. Transaction-level data is never public. Sources in order: TallyPrime sample company data (tonight), synthetic generator with planted violations (build it, it is also the test suite), one anonymized real Tally backup from a friendly CA firm under NDA (worth more than everything else combined; asking for it doubles as validation).

## 11. Validation plan and kill criteria

Fifteen partner interviews within 7 days. The one question that matters: "Would you pay for inspection-proof workpapers even at zero time savings?" Probe: "When were you last selected for peer review and how confident were you in your file?"
Kill criterion: if partners consistently treat defensibility as free-rider expectation and only pay for efficiency, this is a feature of CORAA-class tools, not a company. Stop or reposition.
Channels: r/CharteredAccountants (research-framed posts, not pitches), CA WhatsApp groups (higher yield), direct outreach. Every interview ends with the ask for one old Tally backup.

## 12. Open questions (do not paper over these)

- CORAA's actual traction and pricing. Research before committing positioning.
- Whether the per-audit price point clears ₹5k or collapses toward ₹1k.
- Which venture path (AI-native audit practice vs US expansion) — decide after wedge signal, not before.
- Current ICAI peer review mandate phase and thresholds — verify on ICAI site before repeating in any pitch.
- Exact NFRA order citations for pitch use — pull real orders, quote precisely.

## 13. Style rules for all generated content in this repo

- No em dashes anywhere: code comments, docs, UI copy, commit messages.
- Spare, direct prose. No exclamation marks. No bolded-label-plus-colon scaffolding in documents.
- Never overstate capability: UI copy and docs describe what the system does today, not the roadmap.
- Product copy leads with defensibility, never time savings.
- Naming in code follows the four-object vocabulary exactly: TransactionGraph, Provenance, EvidenceTrail, Seal. Do not introduce synonyms.