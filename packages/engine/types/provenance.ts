import type {
  ArtifactId,
  ContentHash,
  EngagementRef,
  GraphFactId,
  IngestionRunId,
  IsoTimestamp,
  ProvenanceRecordId,
  SemverString,
  SourceLocation
} from "./primitives.js";

export type ArtifactDeclaredType =
  | "tally-xml"
  | "tally-editlog"
  | "synthetic"
  | "pdf"
  | "xlsx"
  | "csv"
  | "unknown";

export type ArtifactParseStatus =
  | "received"
  | "parsed"
  | "failed";

export interface ArtifactCustodyRecord extends EngagementRef {
  readonly id: ArtifactId;
  readonly hashAlgorithm: "sha256";
  readonly contentHash: ContentHash;
  readonly byteSize: number;
  readonly declaredType: ArtifactDeclaredType;
  readonly detectedType: string;
  readonly uploadedBy: string;
  readonly receivedAt: IsoTimestamp;
  readonly parseStatus: ArtifactParseStatus;
  readonly parseFailureReason?: string;
}

export interface ParserRef {
  readonly name: "tally-xml" | "tally-editlog" | "synthetic" | string;
  readonly version: SemverString;
}

export interface DerivationRef {
  readonly algorithm: string;
  readonly version: SemverString;
  readonly passId: string;
  readonly inputFactIds: readonly GraphFactId[];
}

export interface Provenance extends EngagementRef {
  readonly id: ProvenanceRecordId;
  readonly artifactHash: ContentHash;
  readonly sourceLocation: SourceLocation;
  readonly parser: ParserRef;
  readonly derivation: DerivationRef | null;
  readonly ingestionRunId: IngestionRunId;
  readonly recordedAt: IsoTimestamp;
}

export interface CandidateFact<TPayload extends object = object> {
  readonly tempId: string;
  readonly artifactHash: ContentHash;
  readonly sourceLocation: SourceLocation;
  readonly parser: ParserRef;
  readonly payload: TPayload;
}

export interface ParseIssue {
  readonly code: string;
  readonly message: string;
  readonly sourceLocation?: SourceLocation;
}

export interface ParseResult<TFact extends CandidateFact = CandidateFact> {
  readonly facts: readonly TFact[];
  readonly errors: readonly ParseIssue[];
}
