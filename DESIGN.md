# DESIGN.md - Audit Evidence Engine

Companion to BRIEF.md and ARCHITECTURE.md. BRIEF.md says why, ARCHITECTURE.md says how, this file says what the product looks like, sounds like, and feels like, and why those choices defend the product's core claim. The internal name of the design language is Workpaper.

Governing decision: the first designed surface is the workpaper PDF, not the web app. The PDF ships in the CLI path before any web screen exists, and the web app inherits the paper's visual language, never the reverse. The override preview promise in ARCHITECTURE.md 7a, the partner sees what the inspector will see, only holds if screen and paper are one visual system.

---

## 1. Who is looking, and in what state

A signing partner in September, forty tax audits open, five overworked associates, personal liability on every signature. They are not exploring data for pleasure. They are disposing of exceptions under time pressure, and every screen either earns their trust or burns their time.

The register is professional instrument, not consumer software. Reference points worth learning from: typeset legal documents, ledger paper, bank statements, flight instruments. Reference points to refuse: the current defaults of AI-generated software, which read as purple gradients, glassmorphism, sparkle iconography, chat bubbles, celebration animations, and skeleton shimmer. A partner who has seen ten AI demos this year will subconsciously price this product by whether it looks like the other ten.

## 2. Principles

1. The file is the interface. Every screen is a view of the future sealed document. If a screen shows something the workpaper cannot show, the screen is lying about the product.
2. Evidence has a look. Every displayed fact is visibly traceable, with Provenance one hover away. Nothing decorative may imply certainty the system does not have.
3. Density is respect. Professionals read tables all day. Generous whitespace belongs to marketing sites; ruled, aligned, dense tables belong here.
4. Color is semantics and nothing else. Chrome is neutral paper and ink. The only saturated colors on any screen are finding statuses, and one accent for interactive affordances.
5. Motion is confirmation, not delight. One transition exists in the product, the descent between storeys. Everything else changes state instantly.
6. Words over icons. Statuses are spelled out. Icons appear only where space forces them and always beside a word. A grayscale photocopy of any screen or page must still communicate every status.
7. Never perform intelligence. No AI branding, no sparkle, no chat surface, no typing indicators. The system shows its work; it does not talk about itself.

## 3. Typography

The IBM Plex superfamily across everything: Plex Serif for document and narrative surfaces, Plex Sans for interface chrome, Plex Mono for hashes, ids, and voucher numbers.

Reasons, in order. It is one coherent family across screen and PDF, which is the design's central requirement. It has true tabular lining figures, and this product is mostly numbers. It is open source and hosted on GitHub, which the PDF render pipeline requires, since fonts install via fontconfig from raw GitHub URLs per ARCHITECTURE.md section 8. And it carries an engineering-document character that suits an instrument built to survive inspection.

Rules:

- Numbers are always tabular figures. Amounts right-align. Dates use the fixed form 04 Apr 2025.
- Amounts display in rupees with Indian digit grouping, 4,85,000.00, with the rupee sign carried by the column header, not repeated in every cell. Paise always shown, two digits.
- Hashes and ids render in Plex Mono, truncated to eight characters with click-to-copy of the full value.
- The type scale is small: 12, 13, 14, 16, 20. Weight and spacing do the hierarchy work, not a parade of sizes.

## 4. Color

The ground is paper and ink, slightly warm, never pure white or pure black.

```text
--paper            #FBFAF7   page ground
--paper-shade      #F3F1EA   table heads, bands, wells
--ink              #1C1B18   primary text
--ink-mute         #6B675C   secondary text, labels
--hairline         #DAD6CA   rules and borders
--accent           #1F4B6E   links, buttons, focus, selection
```

Finding statuses own the only other colors in the product, and those colors appear nowhere else, so they never dilute:

```text
--status-exception     #A23B2E   oxide red, serious, not alarm
--status-untestable    #8A6100   ochre, absence demanding attention
--status-pass          #5F7464   moss, deliberately quiet
--status-misconfigured #45414E   graphite, an engineering state
```

PASS_SUMMARY is understated on purpose. Passing is the expected background state of an audit, not a celebration. UNTESTABLE is warm and prominent because the invariant says it is never buried. Status is always encoded as color plus the spelled word, never color alone.

No gradients anywhere. No purple. Dark mode is deferred, recorded here as a decision, not an omission; this instrument is used in offices, in daylight, against paper.

## 5. Surface, line, space

A 4px spatial grid. Corner radius 2px, applied sparingly. Hairline borders do the structural work; shadows are reserved for the one floating element in the product, the Provenance popover, and even there a 1px border carries most of the edge. Tables are ruled like ledger paper: hairline row separators, a shaded head row, no zebra striping. No cards inside cards. Work screens fill the width they need for their columns and no more.

## 6. Motion

Two speeds exist: instant, and 160ms ease-out. State changes, filters, and dispositions are instant. The descent animates: when the user drops from EvidenceTrail to TransactionGraph to source document, the new storey slides up over 160ms, opacity and transform only, reinforcing the altitude model from ARCHITECTURE.md 7c. Nothing bounces, nothing springs, nothing shimmers. Loading states are a line of text with a count, "Parsing 4,182 vouchers", never a skeleton screen.

## 7. Voice

Declarative, exact, unhurried. Every sentence describes what the system did or what it needs, with counts and names. Per BRIEF.md section 13, copy leads with defensibility, never time savings, and never overstates.

- Empty queue: "No exceptions. 4,182 vouchers tested by 5 controls."
- UNTESTABLE finding: "Cutoff testing could not run for 214 vouchers. Evidence dates are missing for these records."
- Parse failure: "bank-apr.pdf failed parsing. Reason: password protected. The artifact remains in custody, unparsed."
- Buttons are verbs with objects: "Record override", "Seal engagement", "Open source document". Never "Done", "Got it", "OK".
- No exclamation marks, no apologies, no mascot warmth. The product is calm because the user is not.

## 8. The signature interaction, the descent

Three storeys, per ARCHITECTURE.md 7c, with a persistent altitude indicator in the top bar: Trail, Graph, Source. The two-click promise is a layout contract:

1. Click a finding in the queue. The finding opens with its facts listed, each fact showing its provenance affordance.
2. Click a fact's source reference. The artifact viewer opens at the exact provenance location.

The Provenance popover answers "why does the system believe this" on hover over any fact: artifact hash, source location, parser name and version, ingestion run. One hover, four lines, one link to open the source at that location.

### 8a. The trail drawn as an argument

The EvidenceTrail is a DAG, and the top storey renders it as one. Not as a network diagram; as a derivation, read left to right in the order the argument was built: control run, population, facts examined, finding, review or override, sign-off. Edges never point backward.

Layout is layered and deterministic, computed from the trail content alone. The same trail always draws the same picture, on every machine, on every run. No force simulation, no physics, no randomness, no saved drag positions. Node ordering within a layer reuses the engine's total-order tiebreakers. A reproducible argument deserves a reproducible picture, and a layout that settles differently every time would quietly contradict the product's central claim.

Nodes are typed cards, not circles: the node kind in small caps, one load-bearing value beneath it, a voucher number, an amount, a hash chip, and status carried as a left rule in the status color, the same treatment as the UNTESTABLE band. Edges are hairlines with their typed relation visible on hover. Supersession renders the superseded node ghosted with a dashed edge to its replacement; nothing is ever hidden, because nothing was ever deleted.

Most trails are small enough to read whole. When a control examined thousands of facts, the fact fan collapses into a counted bundle node, "1,284 vouchers examined", which expands on click. The graph never scrolls in two axes; it fits the width and grows downward only.

### 8b. The TransactionGraph as neighborhood, never as hairball

The middle storey never draws the whole TransactionGraph. Four thousand vouchers as a starfield is decoration, not evidence. Descending from a trail node opens an ego view scoped by that node: the voucher with its lines, accounts, party, edit-log events, and the sibling facts the control paired it with, one to two hops out. Everything beyond the neighborhood is present as a dimmed count, "3,102 other payment vouchers", not as dots.

The payoff is that findings become pictures. A duplicate payment is two voucher cards converging on one party card with equal amounts on the edges. An edit-log gap is a lane of voucher activity above an empty lane of log silence. The graph is how a partner understands a finding in one look; the neighborhood scoping is what keeps that look honest.

This dimming and reprojection is also the mechanism lenses use in exploration mode, ARCHITECTURE.md 7b: a lens highlights the answer's path and dims the rest. The canvas is built for that from the start even though exploration mode ships later.

### 8c. Rows and graph are projections of the same trail

The queue does not go away. Triage across forty audits is row work: sort by materiality, filter, disposition, next. Comprehension of one argument is graph work. The finding drill-down carries a two-way toggle, Rows and Graph, and both render the same append-only trail nodes. Neither view is decoration; they answer different questions at different speeds.

## 9. Screens, compelled mode

### 9a. Engagement dashboard

Custody first. A ruled table of artifacts: name, content hash, size, received at, parse status. A failed parse shows failed with its reason inline in oxide red text, never hidden behind a click. Below it, a control run strip: each control with version, run state, and finding counts by status. No decorative charts. The dashboard answers two questions, what do we have custody of, and what has been tested.

### 9b. Exception queue

The working screen of the product. Layout, top to bottom:

- An UNTESTABLE band, pinned above everything when present, ochre left rule, stating what could not be tested and what evidence is missing. It cannot be collapsed or filtered away.
- The exception table, grouped by control, sorted by materiality descending within groups. Columns: status, control, reference, party, amount, date, materiality, disposition. Filter row of plain selects above, control and status and disposition.
- A footer line with totals: populations tested, exceptions open, exceptions dispositioned.

Row click descends into the finding.

### 9c. Finding drill-down

Header: status word, control id and semver, finding id as mono hash chip, and the replay line, "Re-running this control reproduces this finding byte for byte", which is the determinism claim made visible. Body: the facts examined, as a ruled table with provenance affordances per fact, with the Rows and Graph toggle from section 8c; the graph tab draws the finding's trail per section 8a and descends into the neighborhood view per section 8b. Bottom: the source pane, opened at the provenance location when a fact is selected.

### 9d. Override flow

A two-pane screen, form left, consequence right. The left pane collects the structured reason and the materiality justification, with actor and timestamp recorded automatically. The right pane is a live render of the exception register entry exactly as it will typeset in the sealed workpaper, serif, including the override reason verbatim as it is typed. The header of the right pane reads "As it will appear in the sealed workpaper". This pane is the product's answer to the careless-override boomerang recorded in BRIEF.md section 12; the partner reads their own thin reasoning in the inspector's typography before committing. Commit button reads "Record override". It stays disabled until both fields meet minimum substance.

### 9e. Sign-off

A summary of open items. If exceptions lack disposition, the blocked state is a plain sentence, "2 exceptions without disposition block sign-off", each linked. When clear, the seal summary lists what will be hashed, artifacts, trail nodes, edges, export bundle, and the action reads "Seal and sign off". After sealing, the seal certificate block: root hash in mono, timestamp, previous seal reference, and the verification QR.

## 10. The workpaper PDF

The deliverable, and the origin of the whole language. A4. Plex Serif for narrative, Plex Sans for labels and table heads, Plex Mono for hashes and ids. Every page footer carries page number, engagement id, and the seal root short hash. The Rule 11(g) evidence pack is a self-contained section with its own cover, per ARCHITECTURE.md section 8. The exception register table must survive a grayscale photocopy: statuses as words, hairline rules, no color dependence. The seal certificate page carries the QR and the verify URL in full text beside it, since paper outlives links. Every rendered sentence traces to a bundle field; the design leaves no room for orphan prose.

## 11. Component inventory, v0

Status chip, word plus color, never color alone. Hash chip, mono, eight characters, click to copy. Provenance popover. Ruled table. Altitude indicator. UNTESTABLE band. Artifact viewer frame. Override form with render preview pane. Seal certificate block. Filter row. Trail canvas with typed node cards, counted bundle nodes, and the Rows and Graph toggle. Neighborhood view with dimmed-count periphery.

Deliberately absent: toasts (confirmations render inline at the row that changed), modals (overrides and sign-off are screens, not interruptions), tabs inside tabs, accordion nesting, breadcrumb trails longer than the three storeys, tooltips carrying essential information.

## 12. What we refuse

Purple gradients. Glassmorphism. Sparkle or robot iconography. Chat surfaces of any kind, per BRIEF.md section 4. Skeleton shimmer. Confetti and success animations. Mascots and illustrations of people. Animated number tickers. Decorative charts. Dashboard-as-wallpaper. Rounded-corner card soup. Placeholder lorem in any committed artifact. Dark patterns of urgency. Any icon that implies the system is thinking. Force-directed graph layouts and spring physics. Whole-ledger starfields. Graph views whose layout differs between two renders of the same trail.

## 13. Implementation notes

Tokens ship as CSS variables under the names in section 4, defined once. Tailwind is acceptable as a delivery mechanism if every value resolves to a token; raw palette utilities like blue-500 are banned in app code. Headless primitives such as Radix are acceptable; any component kit must be visually unrecognizable after tokening, and if a screen could be mistaken for a shadcn default theme, it fails review.

The trail canvas needs no graph library in v0. Trails are small DAGs with known node types; a layered layout is a few hundred lines of deterministic TypeScript, and SVG rendering keeps typography identical to the rest of the product. If a library is ever adopted it must accept a precomputed layout; layout engines that own their own randomness are banned by section 12.

Reference renderings, kept in step with this file: docs/design/mockup-exception-queue.html for sections 4 through 9, docs/design/mockup-trail-graph.html for sections 8a and 8b.
