import type {
  ContentHash,
  EngagementRef,
  IsoTimestamp,
  MerkleRoot,
  SealId,
  Signature,
  SignatureAlgorithm,
  TimestampAuthorityProtocol,
  TimestampToken,
  WorkpaperExportId
} from "./primitives.js";

export type SealPoint =
  | "fieldwork-complete"
  | "review-complete"
  | "sign-off";

export interface SealManifest extends EngagementRef {
  readonly artifactHashes: readonly ContentHash[];
  readonly trailNodeHashes: readonly ContentHash[];
  readonly trailEdgeHashes: readonly ContentHash[];
  readonly exportBundleHash: ContentHash;
  readonly merkleRoot: MerkleRoot;
}

export interface Seal extends EngagementRef {
  readonly id: SealId;
  readonly point: SealPoint;
  readonly manifest: SealManifest;
  readonly signatureAlgorithm: SignatureAlgorithm;
  readonly signature: Signature;
  readonly timestampProtocol: TimestampAuthorityProtocol;
  readonly timestampToken: TimestampToken;
  readonly previousSealRoot?: MerkleRoot;
  readonly sealedAt: IsoTimestamp;
}

export interface WorkpaperBundleRef extends EngagementRef {
  readonly id: WorkpaperExportId;
  readonly bundleHash: ContentHash;
  readonly sealId?: SealId;
}

export interface SealVerificationResult {
  readonly ok: boolean;
  readonly root: MerkleRoot;
  readonly checkedAt: IsoTimestamp;
  readonly failures: readonly string[];
}
