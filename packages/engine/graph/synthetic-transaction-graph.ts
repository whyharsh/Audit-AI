import {
  canonicalizeJson,
  canonicalJsonInteger,
  toCanonicalJsonValue
} from "../types/canonical-json.js";
import { hashCanonicalJson, hashString } from "../types/hash.js";
import type {
  ArtifactCustodyRecord,
  ArtifactDeclaredType,
  ParserRef,
  Provenance
} from "../types/provenance.js";
import type {
  ArtifactId,
  ContentHash,
  GraphEdgeId,
  GraphFactId,
  IngestionRunId,
  IsoTimestamp,
  ProvenanceRecordId,
  SemverString,
  SourceLocation,
  UserId
} from "../types/primitives.js";
import type {
  Account,
  Document,
  EditLogEvent,
  GraphEdge,
  GraphEdgeRelation,
  GraphNodeRef,
  Party,
  TransactionGraph,
  TransactionGraphEntityKind,
  TransactionGraphFact,
  Voucher,
  VoucherLine
} from "../types/transaction-graph.js";
import {
  parseSyntheticDataset,
  type SyntheticDataset,
  type SyntheticDatasetInput,
  type SyntheticDocumentSourceLocation,
  type SyntheticEditLogEvent,
  type SyntheticLedger,
  type SyntheticParty,
  type SyntheticSourceDocument,
  type SyntheticVoucher,
  type SyntheticVoucherLine
} from "../ingest/synthetic-tally.js";

export interface SyntheticTransactionGraphOptions {
  readonly ingestionRunId?: IngestionRunId;
  readonly recordedAt?: IsoTimestamp;
  readonly uploadedBy?: UserId;
}

export interface SyntheticSourceRefIndexEntry {
  readonly sourceRef: string;
  readonly factId: GraphFactId;
  readonly factKind: TransactionGraphEntityKind;
  readonly provenanceRecordId: ProvenanceRecordId;
}

export interface SyntheticTransactionGraphBuild {
  readonly dataset: SyntheticDataset;
  readonly transactionGraph: TransactionGraph;
  readonly provenanceRecords: readonly Provenance[];
  readonly artifactCustodyRecords: readonly ArtifactCustodyRecord[];
  readonly sourceRefIndex: readonly SyntheticSourceRefIndexEntry[];
}

interface ArtifactSet {
  readonly tally: ArtifactRecordSeed;
  readonly editLog: ArtifactRecordSeed;
  readonly sourceDocuments: ArtifactRecordSeed;
  readonly documentsById: ReadonlyMap<string, ArtifactRecordSeed>;
}

interface ArtifactRecordSeed {
  readonly id: ArtifactId;
  readonly contentHash: ContentHash;
  readonly byteSize: number;
  readonly declaredType: ArtifactDeclaredType;
  readonly detectedType: string;
  readonly label: string;
}

interface FactBuildContext {
  readonly dataset: SyntheticDataset;
  readonly artifacts: ArtifactSet;
  readonly ingestionRunId: IngestionRunId;
  readonly recordedAt: IsoTimestamp;
  readonly parserVersion: SemverString;
  readonly provenanceRecords: Provenance[];
  readonly sourceRefIndex: SyntheticSourceRefIndexEntry[];
}

interface BuiltFact<TFact extends TransactionGraphFact> {
  readonly fact: TFact;
  readonly sourceRef: string;
}

const parserVersion = "0.1.0" as SemverString;
const defaultRecordedAt = "2025-04-05T10:00:00+05:30" as IsoTimestamp;
const defaultUploadedBy = "user-demo-importer" as UserId;

export function materializeSyntheticTransactionGraph(
  input: SyntheticDatasetInput,
  options: SyntheticTransactionGraphOptions = {}
): SyntheticTransactionGraphBuild {
  const dataset = parseSyntheticDataset(input);
  const artifacts = buildArtifactSet(dataset, input);
  return buildSyntheticTransactionGraph(dataset, artifacts, options);
}

export function resolveSyntheticGraphFact(
  build: SyntheticTransactionGraphBuild,
  sourceRef: string
): TransactionGraphFact | undefined {
  const indexEntry = build.sourceRefIndex.find(
    (entry) => entry.sourceRef === sourceRef
  );
  if (indexEntry === undefined) {
    return undefined;
  }

  return build.transactionGraph.facts.find(
    (fact) => fact.id === indexEntry.factId
  );
}

function buildSyntheticTransactionGraph(
  dataset: SyntheticDataset,
  artifacts: ArtifactSet,
  options: SyntheticTransactionGraphOptions
): SyntheticTransactionGraphBuild {
  const ingestionRunId =
    options.ingestionRunId ??
    (`ingestion-${dataset.fixtureId}` as IngestionRunId);
  const recordedAt = options.recordedAt ?? defaultRecordedAt;
  const uploadedBy = options.uploadedBy ?? defaultUploadedBy;
  const provenanceRecords: Provenance[] = [];
  const sourceRefIndex: SyntheticSourceRefIndexEntry[] = [];
  const context: FactBuildContext = {
    dataset,
    artifacts,
    ingestionRunId,
    recordedAt,
    parserVersion,
    provenanceRecords,
    sourceRefIndex
  };

  const accountFacts = dataset.ledgers.map((ledger) =>
    buildAccountFact(context, ledger)
  );
  const partyFacts = dataset.parties.map((party) =>
    buildPartyFact(context, party)
  );
  const accountIdsByGuid = mapBuiltFacts(accountFacts);
  const partyIdsByGuid = mapBuiltFacts(partyFacts);
  const documentFacts = dataset.sourceDocuments.map((document) =>
    buildDocumentFact(context, document)
  );
  const documentIdsByRef = mapBuiltFacts(documentFacts);
  const vouchers = dataset.vouchers.map((voucher) =>
    buildVoucherFact(context, voucher, partyIdsByGuid, dataset.sourceDocuments)
  );
  const voucherIdsByGuid = mapBuiltFacts(vouchers);
  const lineFacts = dataset.vouchers.flatMap((voucher) =>
    voucher.lines.map((line) =>
      buildVoucherLineFact(context, voucher, line, voucherIdsByGuid, accountIdsByGuid)
    )
  );
  const editLogFacts = dataset.editLogEvents.map((event) =>
    buildEditLogEventFact(context, event, voucherIdsByGuid)
  );
  const facts: TransactionGraphFact[] = [
    ...accountFacts.map((built) => built.fact),
    ...partyFacts.map((built) => built.fact),
    ...vouchers.map((built) => built.fact),
    ...lineFacts.map((built) => built.fact),
    ...editLogFacts.map((built) => built.fact),
    ...documentFacts.map((built) => built.fact)
  ];
  const edges = [
    ...buildVoucherPartyEdges(context, vouchers),
    ...buildVoucherLineEdges(context, vouchers, lineFacts),
    ...buildVoucherDocumentEdges(context, vouchers, dataset.sourceDocuments, documentIdsByRef)
  ];

  return {
    dataset,
    transactionGraph: {
      facts,
      edges
    },
    provenanceRecords,
    artifactCustodyRecords: buildCustodyRecords(
      dataset,
      artifacts,
      recordedAt,
      uploadedBy
    ),
    sourceRefIndex
  };
}

function buildAccountFact(
  context: FactBuildContext,
  ledger: SyntheticLedger
): BuiltFact<Account> {
  const sourceRef = ledger.id;
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: context.artifacts.tally.contentHash,
    sourceLocation: xmlLocation(
      `/AUDIT_EVIDENCE_SYNTHETIC_TALLY/LEDGERS/LEDGER[@guid="${ledger.id}"]`
    ),
    parser: tallyParser()
  });
  const fact: Account = {
    ...engagementRef(context.dataset),
    id: graphFactId(context.dataset.fixtureId, "Account", sourceRef),
    kind: "Account",
    provenanceRecordId: provenance.id,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt,
    name: ledger.name,
    accountKind: ledger.kind,
    tallyGuid: ledger.id
  };
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildPartyFact(
  context: FactBuildContext,
  party: SyntheticParty
): BuiltFact<Party> {
  const sourceRef = party.id;
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: context.artifacts.tally.contentHash,
    sourceLocation: xmlLocation(
      `/AUDIT_EVIDENCE_SYNTHETIC_TALLY/PARTIES/PARTY[@guid="${party.id}"]`
    ),
    parser: tallyParser()
  });
  const fact = withOptionalFields(
    {
      ...engagementRef(context.dataset),
      id: graphFactId(context.dataset.fixtureId, "Party", sourceRef),
      kind: "Party" as const,
      provenanceRecordId: provenance.id,
      ingestionRunId: context.ingestionRunId,
      recordedAt: context.recordedAt,
      name: party.name,
      tallyGuid: party.id
    },
    {
      gstin: party.gstin,
      pan: party.pan
    }
  );
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildVoucherFact(
  context: FactBuildContext,
  voucher: SyntheticVoucher,
  partyIdsByGuid: ReadonlyMap<string, GraphFactId>,
  documents: readonly SyntheticSourceDocument[]
): BuiltFact<Voucher> {
  const sourceRef = voucher.id;
  const document = voucher.documentRef === undefined
    ? undefined
    : documents.find((item) => item.id === voucher.documentRef);
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: context.artifacts.tally.contentHash,
    sourceLocation: xmlLocation(
      `/AUDIT_EVIDENCE_SYNTHETIC_TALLY/VOUCHERS/VOUCHER[@guid="${voucher.id}"]`
    ),
    parser: tallyParser()
  });
  const partyId = voucher.partyGuid === undefined
    ? undefined
    : partyIdsByGuid.get(voucher.partyGuid);
  const fact: Voucher = {
    ...engagementRef(context.dataset),
    id: graphFactId(context.dataset.fixtureId, "Voucher", sourceRef),
    kind: "Voucher",
    provenanceRecordId: provenance.id,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt,
    voucherKind: voucher.voucherKind,
    voucherNumber: voucher.voucherNumber,
    voucherDate: voucher.voucherDate,
    totalAmountPaise: voucher.totalAmountPaise,
    tallyGuid: voucher.id,
    ...(partyId === undefined ? {} : { partyId }),
    ...(document === undefined ? {} : { evidenceDate: document.documentDate }),
    ...(voucher.narration === undefined ? {} : { narration: voucher.narration })
  };
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildVoucherLineFact(
  context: FactBuildContext,
  voucher: SyntheticVoucher,
  line: SyntheticVoucherLine,
  voucherIdsByGuid: ReadonlyMap<string, GraphFactId>,
  accountIdsByGuid: ReadonlyMap<string, GraphFactId>
): BuiltFact<VoucherLine> {
  const sourceRef = `${voucher.id}:line-${line.lineNumber}`;
  const voucherId = requireMapValue(voucherIdsByGuid, voucher.id, "voucher");
  const accountId = requireMapValue(
    accountIdsByGuid,
    line.accountGuid,
    "account"
  );
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: context.artifacts.tally.contentHash,
    sourceLocation: xmlLocation(
      `/AUDIT_EVIDENCE_SYNTHETIC_TALLY/VOUCHERS/VOUCHER[@guid="${voucher.id}"]/LINE[${line.lineNumber}]`
    ),
    parser: tallyParser()
  });
  const fact: VoucherLine = {
    ...engagementRef(context.dataset),
    id: graphFactId(context.dataset.fixtureId, "VoucherLine", sourceRef),
    kind: "VoucherLine",
    provenanceRecordId: provenance.id,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt,
    voucherId,
    accountId,
    lineNumber: line.lineNumber,
    debitPaise: line.debitPaise,
    creditPaise: line.creditPaise
  };
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildEditLogEventFact(
  context: FactBuildContext,
  event: SyntheticEditLogEvent,
  voucherIdsByGuid: ReadonlyMap<string, GraphFactId>
): BuiltFact<EditLogEvent> {
  const sourceRef = event.id;
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: context.artifacts.editLog.contentHash,
    sourceLocation: syntheticLocation(
      "artifacts/tally-editlog.json",
      `events.${event.id}`
    ),
    parser: editLogParser()
  });
  const voucherId = event.voucherGuid === undefined
    ? undefined
    : voucherIdsByGuid.get(event.voucherGuid);
  const fact: EditLogEvent = {
    ...engagementRef(context.dataset),
    id: graphFactId(context.dataset.fixtureId, "EditLogEvent", sourceRef),
    kind: "EditLogEvent",
    provenanceRecordId: provenance.id,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt,
    eventKind: event.eventKind,
    occurredAt: event.occurredAt,
    ...(event.userName === undefined ? {} : { userName: event.userName }),
    ...(voucherId === undefined ? {} : { voucherId }),
    ...(event.fieldName === undefined ? {} : { fieldName: event.fieldName }),
    ...(event.beforeValue === undefined ? {} : { beforeValue: event.beforeValue }),
    ...(event.afterValue === undefined ? {} : { afterValue: event.afterValue })
  };
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildDocumentFact(
  context: FactBuildContext,
  document: SyntheticSourceDocument
): BuiltFact<Document> {
  const sourceRef = document.id;
  const artifact = requireMapValue(
    context.artifacts.documentsById,
    document.id,
    "document artifact"
  );
  const provenance = makeProvenance(context, {
    sourceRef,
    artifactHash: artifact.contentHash,
    sourceLocation: documentSourceLocation(document.sourceLocation),
    parser: syntheticParser()
  });
  const fact: Document = {
    ...engagementRef(context.dataset),
    id: graphFactId(context.dataset.fixtureId, "Document", sourceRef),
    kind: "Document",
    provenanceRecordId: provenance.id,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt,
    artifactHash: artifact.contentHash,
    documentType: document.documentType,
    title: document.documentNumber
  };
  indexFact(context, sourceRef, fact);
  return { fact, sourceRef };
}

function buildVoucherPartyEdges(
  context: FactBuildContext,
  vouchers: readonly BuiltFact<Voucher>[]
): readonly GraphEdge[] {
  return vouchers
    .filter((voucher) => voucher.fact.partyId !== undefined)
    .map((voucher) =>
      makeEdge(context, {
        relation: "voucher-party",
        from: { kind: "Voucher", id: voucher.fact.id },
        to: { kind: "Party", id: voucher.fact.partyId as GraphFactId },
        provenanceRecordId: voucher.fact.provenanceRecordId
      })
    );
}

function buildVoucherLineEdges(
  context: FactBuildContext,
  vouchers: readonly BuiltFact<Voucher>[],
  lines: readonly BuiltFact<VoucherLine>[]
): readonly GraphEdge[] {
  const vouchersById = new Set(vouchers.map((voucher) => voucher.fact.id));
  return lines
    .filter((line) => vouchersById.has(line.fact.voucherId))
    .map((line) =>
      makeEdge(context, {
        relation: "voucher-line",
        from: { kind: "Voucher", id: line.fact.voucherId },
        to: { kind: "VoucherLine", id: line.fact.id },
        provenanceRecordId: line.fact.provenanceRecordId
      })
    );
}

function buildVoucherDocumentEdges(
  context: FactBuildContext,
  vouchers: readonly BuiltFact<Voucher>[],
  documents: readonly SyntheticSourceDocument[],
  documentIdsByRef: ReadonlyMap<string, GraphFactId>
): readonly GraphEdge[] {
  const vouchersBySourceRef = new Map(
    vouchers.map((voucher) => [voucher.sourceRef, voucher.fact])
  );
  const edges: GraphEdge[] = [];

  for (const document of documents) {
    const documentFactId = requireMapValue(
      documentIdsByRef,
      document.id,
      "document"
    );
    const documentProvenanceId = requireSourceRefIndex(
      context,
      document.id
    ).provenanceRecordId;
    for (const voucherGuid of document.voucherGuids) {
      const voucher = vouchersBySourceRef.get(voucherGuid);
      if (voucher === undefined) {
        continue;
      }

      edges.push(
        makeEdge(context, {
          relation: "voucher-document",
          from: { kind: "Voucher", id: voucher.id },
          to: { kind: "Document", id: documentFactId },
          provenanceRecordId: documentProvenanceId
        })
      );
    }
  }

  return edges;
}

function buildArtifactSet(
  dataset: SyntheticDataset,
  input: SyntheticDatasetInput
): ArtifactSet {
  const tally = artifactSeed({
    id: `artifact-${dataset.fixtureId}-tally-daybook`,
    label: "artifacts/tally-daybook.xml",
    content: input.tallyXml,
    declaredType: "tally-xml",
    detectedType: "application/xml"
  });
  const editLog = artifactSeed({
    id: `artifact-${dataset.fixtureId}-tally-editlog`,
    label: "artifacts/tally-editlog.json",
    content: input.editLogJson,
    declaredType: "tally-editlog",
    detectedType: "application/json"
  });
  const sourceDocuments = artifactSeed({
    id: `artifact-${dataset.fixtureId}-source-documents`,
    label: "artifacts/source-documents.json",
    content: input.sourceDocumentsJson,
    declaredType: "synthetic",
    detectedType: "application/json"
  });
  const documentsById = new Map(
    dataset.sourceDocuments.map((document) => [
      document.id,
      artifactSeed({
        id: `artifact-${dataset.fixtureId}-${document.id}`,
        label: document.artifactName,
        content: canonicalDocumentPlaceholder(document),
        declaredType: "pdf",
        detectedType: "synthetic/pdf-placeholder"
      })
    ])
  );

  return {
    tally,
    editLog,
    sourceDocuments,
    documentsById
  };
}

function buildCustodyRecords(
  dataset: SyntheticDataset,
  artifacts: ArtifactSet,
  recordedAt: IsoTimestamp,
  uploadedBy: UserId
): readonly ArtifactCustodyRecord[] {
  return [
    custodyRecord(dataset, artifacts.tally, recordedAt, uploadedBy),
    custodyRecord(dataset, artifacts.editLog, recordedAt, uploadedBy),
    custodyRecord(dataset, artifacts.sourceDocuments, recordedAt, uploadedBy),
    ...Array.from(artifacts.documentsById.values()).map((artifact) =>
      custodyRecord(dataset, artifact, recordedAt, uploadedBy)
    )
  ];
}

function custodyRecord(
  dataset: SyntheticDataset,
  artifact: ArtifactRecordSeed,
  recordedAt: IsoTimestamp,
  uploadedBy: UserId
): ArtifactCustodyRecord {
  return {
    ...engagementRef(dataset),
    id: artifact.id,
    hashAlgorithm: "sha256",
    contentHash: artifact.contentHash,
    byteSize: artifact.byteSize,
    declaredType: artifact.declaredType,
    detectedType: artifact.detectedType,
    uploadedBy,
    receivedAt: recordedAt,
    parseStatus: "parsed"
  };
}

function artifactSeed(input: {
  readonly id: string;
  readonly label: string;
  readonly content: string;
  readonly declaredType: ArtifactDeclaredType;
  readonly detectedType: string;
}): ArtifactRecordSeed {
  return {
    id: input.id as ArtifactId,
    contentHash: hashString(input.content),
    byteSize: new TextEncoder().encode(input.content).byteLength,
    declaredType: input.declaredType,
    detectedType: input.detectedType,
    label: input.label
  };
}

function canonicalDocumentPlaceholder(document: SyntheticSourceDocument): string {
  return canonicalizeJson({
    amountPaise: canonicalJsonInteger(document.amountPaise),
    artifactName: document.artifactName,
    documentDate: document.documentDate,
    documentId: document.id,
    documentNumber: document.documentNumber,
    documentType: document.documentType,
    voucherGuids: document.voucherGuids
  });
}

function makeProvenance(
  context: FactBuildContext,
  input: {
    readonly sourceRef: string;
    readonly artifactHash: ContentHash;
    readonly sourceLocation: SourceLocation;
    readonly parser: ParserRef;
  }
): Provenance {
  const provenance: Provenance = {
    ...engagementRef(context.dataset),
    id: provenanceRecordId(context.dataset.fixtureId, input),
    artifactHash: input.artifactHash,
    sourceLocation: input.sourceLocation,
    parser: input.parser,
    derivation: null,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt
  };
  context.provenanceRecords.push(provenance);
  return provenance;
}

function makeEdge(
  context: FactBuildContext,
  input: {
    readonly relation: GraphEdgeRelation;
    readonly from: GraphNodeRef;
    readonly to: GraphNodeRef;
    readonly provenanceRecordId: ProvenanceRecordId;
  }
): GraphEdge {
  return {
    ...engagementRef(context.dataset),
    id: graphEdgeId(context.dataset.fixtureId, input),
    relation: input.relation,
    from: input.from,
    to: input.to,
    provenanceRecordId: input.provenanceRecordId,
    ingestionRunId: context.ingestionRunId,
    recordedAt: context.recordedAt
  };
}

function indexFact(
  context: FactBuildContext,
  sourceRef: string,
  fact: TransactionGraphFact
): void {
  context.sourceRefIndex.push({
    sourceRef,
    factId: fact.id,
    factKind: fact.kind,
    provenanceRecordId: fact.provenanceRecordId
  });
}

function graphFactId(
  fixtureId: string,
  kind: TransactionGraphEntityKind,
  sourceRef: string
): GraphFactId {
  return hashCanonicalJson(
    toCanonicalJsonValue({
      fixtureId,
      kind,
      sourceRef,
      type: "GraphFact"
    })
  ) as unknown as GraphFactId;
}

function graphEdgeId(
  fixtureId: string,
  input: {
    readonly relation: GraphEdgeRelation;
    readonly from: GraphNodeRef;
    readonly to: GraphNodeRef;
  }
): GraphEdgeId {
  return hashCanonicalJson(
    toCanonicalJsonValue({
      fixtureId,
      from: input.from,
      relation: input.relation,
      to: input.to,
      type: "GraphEdge"
    })
  ) as unknown as GraphEdgeId;
}

function provenanceRecordId(
  fixtureId: string,
  input: {
    readonly sourceRef: string;
    readonly artifactHash: ContentHash;
    readonly sourceLocation: SourceLocation;
    readonly parser: ParserRef;
  }
): ProvenanceRecordId {
  return hashCanonicalJson(
    toCanonicalJsonValue({
      artifactHash: input.artifactHash,
      fixtureId,
      parserName: input.parser.name,
      parserVersion: input.parser.version,
      sourceLocation: input.sourceLocation,
      sourceRef: input.sourceRef,
      type: "Provenance"
    })
  ) as unknown as ProvenanceRecordId;
}

function mapBuiltFacts(
  facts: readonly BuiltFact<TransactionGraphFact>[]
): ReadonlyMap<string, GraphFactId> {
  return new Map(facts.map((built) => [built.sourceRef, built.fact.id]));
}

function requireMapValue<TValue>(
  map: ReadonlyMap<string, TValue>,
  key: string,
  label: string
): TValue {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Missing ${label}: ${key}`);
  }

  return value;
}

function requireSourceRefIndex(
  context: FactBuildContext,
  sourceRef: string
): SyntheticSourceRefIndexEntry {
  const entry = context.sourceRefIndex.find(
    (candidate) => candidate.sourceRef === sourceRef
  );
  if (entry === undefined) {
    throw new Error(`Missing source ref index: ${sourceRef}`);
  }

  return entry;
}

function xmlLocation(path: string): SourceLocation {
  return {
    kind: "xml",
    path
  };
}

function syntheticLocation(
  fixturePath: string,
  manifestKey: string
): SourceLocation {
  return {
    kind: "synthetic",
    fixturePath,
    manifestKey
  };
}

function documentSourceLocation(
  location: SyntheticDocumentSourceLocation | undefined
): SourceLocation {
  if (
    location?.kind === "document" &&
    location.page !== undefined &&
    location.bbox !== undefined
  ) {
    return {
      kind: "document",
      page: location.page,
      bbox: location.bbox
    };
  }

  return syntheticLocation("artifacts/source-documents.json", "documents");
}

function tallyParser(): ParserRef {
  return {
    name: "tally-xml",
    version: parserVersion
  };
}

function editLogParser(): ParserRef {
  return {
    name: "tally-editlog",
    version: parserVersion
  };
}

function syntheticParser(): ParserRef {
  return {
    name: "synthetic",
    version: parserVersion
  };
}

function engagementRef(dataset: SyntheticDataset) {
  return {
    firmId: dataset.engagement.firmId,
    clientId: dataset.engagement.clientId,
    engagementId: dataset.engagement.engagementId
  };
}

function withOptionalFields<TBase extends object, TOptional extends object>(
  base: TBase,
  optional: TOptional
): TBase & Partial<TOptional> {
  const output = { ...base } as Record<string, unknown>;

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }

  return output as TBase & Partial<TOptional>;
}
