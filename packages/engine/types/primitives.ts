export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type FirmId = Brand<string, "FirmId">;
export type UserId = Brand<string, "UserId">;
export type ClientId = Brand<string, "ClientId">;
export type EngagementId = Brand<string, "EngagementId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type IngestionRunId = Brand<string, "IngestionRunId">;
export type ProvenanceRecordId = Brand<string, "ProvenanceRecordId">;
export type GraphFactId = Brand<string, "GraphFactId">;
export type GraphEdgeId = Brand<string, "GraphEdgeId">;
export type ControlId = Brand<string, "ControlId">;
export type ControlRunId = Brand<string, "ControlRunId">;
export type FindingId = Brand<string, "FindingId">;
export type EvidenceTrailNodeId = Brand<string, "EvidenceTrailNodeId">;
export type EvidenceTrailEdgeId = Brand<string, "EvidenceTrailEdgeId">;
export type SealId = Brand<string, "SealId">;
export type WorkpaperExportId = Brand<string, "WorkpaperExportId">;

export type ContentHash = Brand<string, "ContentHash">;
export type MerkleRoot = Brand<string, "MerkleRoot">;
export type Signature = Brand<string, "Signature">;
export type TimestampToken = Brand<string, "TimestampToken">;
export type SemverString = Brand<string, "SemverString">;
export type IsoDate = Brand<string, "IsoDate">;
export type IsoTimestamp = Brand<string, "IsoTimestamp">;
export type TimezoneName = Brand<string, "TimezoneName">;
export type MoneyPaise = Brand<number, "MoneyPaise">;
export type CanonicalJson = Brand<string, "CanonicalJson">;
export type CanonicalJsonInteger = Brand<number, "CanonicalJsonInteger">;

export type HashAlgorithm = "sha256";
export type SignatureAlgorithm = "ed25519";
export type TimestampAuthorityProtocol = "rfc3161";

export type CanonicalJsonPrimitive =
  | string
  | CanonicalJsonInteger
  | boolean
  | null;

export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface FinancialYear {
  readonly startsOn: IsoDate;
  readonly endsOn: IsoDate;
  readonly timezone: TimezoneName;
}

export interface ActorRef {
  readonly firmId: FirmId;
  readonly userId: UserId;
}

export interface EngagementRef {
  readonly firmId: FirmId;
  readonly clientId: ClientId;
  readonly engagementId: EngagementId;
}

export interface SourceLocationBase {
  readonly kind: string;
}

export interface XmlSourceLocation extends SourceLocationBase {
  readonly kind: "xml";
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
}

export interface TabularSourceLocation extends SourceLocationBase {
  readonly kind: "tabular";
  readonly sheetName?: string;
  readonly row: number;
  readonly column: string;
}

export interface DocumentSourceLocation extends SourceLocationBase {
  readonly kind: "document";
  readonly page: number;
  readonly bbox: readonly [number, number, number, number];
}

export interface SyntheticSourceLocation extends SourceLocationBase {
  readonly kind: "synthetic";
  readonly fixturePath: string;
  readonly manifestKey: string;
}

export type SourceLocation =
  | XmlSourceLocation
  | TabularSourceLocation
  | DocumentSourceLocation
  | SyntheticSourceLocation;
