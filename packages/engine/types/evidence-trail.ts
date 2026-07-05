import type {
  ActorRef,
  CanonicalJsonValue,
  ContentHash,
  ControlRunId,
  EngagementRef,
  EvidenceTrailEdgeId,
  EvidenceTrailNodeId,
  FindingId,
  GraphFactId,
  IsoTimestamp
} from "./primitives.js";

export type EvidenceTrailNodeKind =
  | "CONTROL_RUN"
  | "POPULATION"
  | "FACT_REF"
  | "FINDING"
  | "REVIEW"
  | "OVERRIDE"
  | "SIGN_OFF"
  | "SUPERSESSION";

export type EvidenceTrailEdgeRelation =
  | "tested-by"
  | "evidenced-by"
  | "derived-from"
  | "reviewed-by"
  | "supersedes";

export interface EvidenceTrailNodeBase extends EngagementRef {
  readonly id: EvidenceTrailNodeId;
  readonly kind: EvidenceTrailNodeKind;
  readonly nodeHash: ContentHash;
  readonly recordedAt: IsoTimestamp;
}

export interface ControlRunNode extends EvidenceTrailNodeBase {
  readonly kind: "CONTROL_RUN";
  readonly controlRunId: ControlRunId;
}

export interface PopulationNode extends EvidenceTrailNodeBase {
  readonly kind: "POPULATION";
  readonly controlRunId: ControlRunId;
  readonly populationHash: ContentHash;
  readonly count: number;
}

export interface FactRefNode extends EvidenceTrailNodeBase {
  readonly kind: "FACT_REF";
  readonly factId: GraphFactId;
}

export interface FindingNode extends EvidenceTrailNodeBase {
  readonly kind: "FINDING";
  readonly findingId: FindingId;
}

export interface ReviewNode extends EvidenceTrailNodeBase {
  readonly kind: "REVIEW";
  readonly actor: ActorRef;
  readonly findingId: FindingId;
  readonly disposition: "accepted" | "needs-work";
  readonly note?: string;
}

export interface OverrideNode extends EvidenceTrailNodeBase {
  readonly kind: "OVERRIDE";
  readonly actor: ActorRef;
  readonly findingId: FindingId;
  readonly reason: string;
  readonly materialityJustification: string;
}

export interface SignOffNode extends EvidenceTrailNodeBase {
  readonly kind: "SIGN_OFF";
  readonly actor: ActorRef;
  readonly signedAt: IsoTimestamp;
  readonly openItemSummary: CanonicalJsonValue;
}

export interface SupersessionNode extends EvidenceTrailNodeBase {
  readonly kind: "SUPERSESSION";
  readonly previousNodeId: EvidenceTrailNodeId;
  readonly replacementNodeId: EvidenceTrailNodeId;
  readonly reason: string;
}

export type EvidenceTrailNode =
  | ControlRunNode
  | PopulationNode
  | FactRefNode
  | FindingNode
  | ReviewNode
  | OverrideNode
  | SignOffNode
  | SupersessionNode;

export interface EvidenceTrailEdge extends EngagementRef {
  readonly id: EvidenceTrailEdgeId;
  readonly relation: EvidenceTrailEdgeRelation;
  readonly fromNodeId: EvidenceTrailNodeId;
  readonly toNodeId: EvidenceTrailNodeId;
  readonly edgeHash: ContentHash;
  readonly recordedAt: IsoTimestamp;
}

export interface EvidenceTrail {
  readonly nodes: readonly EvidenceTrailNode[];
  readonly edges: readonly EvidenceTrailEdge[];
}
