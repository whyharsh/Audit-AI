import type {
  ContentHash,
  EngagementRef,
  GraphEdgeId,
  GraphFactId,
  IngestionRunId,
  IsoDate,
  IsoTimestamp,
  MoneyPaise,
  ProvenanceRecordId
} from "./primitives.js";

export type TransactionGraphEntityKind =
  | "Account"
  | "Party"
  | "Voucher"
  | "VoucherLine"
  | "EditLogEvent"
  | "Document";

export type AccountKind =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense"
  | "unknown";

export type VoucherKind =
  | "payment"
  | "receipt"
  | "journal"
  | "sales"
  | "purchase"
  | "contra"
  | "debit-note"
  | "credit-note"
  | "unknown";

export type EditLogEventKind =
  | "feature-enabled"
  | "feature-disabled"
  | "voucher-created"
  | "voucher-updated"
  | "voucher-deleted"
  | "master-updated"
  | "unknown";

export interface GraphFactBase extends EngagementRef {
  readonly id: GraphFactId;
  readonly kind: TransactionGraphEntityKind;
  readonly provenanceRecordId: ProvenanceRecordId;
  readonly ingestionRunId: IngestionRunId;
  readonly supersedes?: GraphFactId;
  readonly recordedAt: IsoTimestamp;
}

export interface Account extends GraphFactBase {
  readonly kind: "Account";
  readonly name: string;
  readonly accountKind: AccountKind;
  readonly parentName?: string;
  readonly tallyGuid?: string;
}

export interface Party extends GraphFactBase {
  readonly kind: "Party";
  readonly name: string;
  readonly gstin?: string;
  readonly pan?: string;
  readonly tallyGuid?: string;
}

export interface Voucher extends GraphFactBase {
  readonly kind: "Voucher";
  readonly voucherKind: VoucherKind;
  readonly voucherNumber: string;
  readonly voucherDate: IsoDate;
  readonly partyId?: GraphFactId;
  readonly narration?: string;
  readonly totalAmountPaise: MoneyPaise;
  readonly tallyGuid?: string;
}

export interface VoucherLine extends GraphFactBase {
  readonly kind: "VoucherLine";
  readonly voucherId: GraphFactId;
  readonly accountId: GraphFactId;
  readonly lineNumber: number;
  readonly debitPaise: MoneyPaise;
  readonly creditPaise: MoneyPaise;
  readonly narration?: string;
}

export interface EditLogEvent extends GraphFactBase {
  readonly kind: "EditLogEvent";
  readonly eventKind: EditLogEventKind;
  readonly occurredAt: IsoTimestamp;
  readonly userName?: string;
  readonly voucherId?: GraphFactId;
  readonly fieldName?: string;
  readonly beforeValue?: string;
  readonly afterValue?: string;
}

export interface Document extends GraphFactBase {
  readonly kind: "Document";
  readonly artifactHash: ContentHash;
  readonly documentType: string;
  readonly title?: string;
}

export type TransactionGraphFact =
  | Account
  | Party
  | Voucher
  | VoucherLine
  | EditLogEvent
  | Document;

export interface GraphNodeRef {
  readonly kind: TransactionGraphEntityKind;
  readonly id: GraphFactId;
}

export type GraphEdgeRelation =
  | "voucher-party"
  | "voucher-line"
  | "voucher-document"
  | "voucher-bank-line"
  | "supersedes"
  | "derived-from";

export interface GraphEdge extends EngagementRef {
  readonly id: GraphEdgeId;
  readonly relation: GraphEdgeRelation;
  readonly from: GraphNodeRef;
  readonly to: GraphNodeRef;
  readonly provenanceRecordId: ProvenanceRecordId;
  readonly ingestionRunId: IngestionRunId;
  readonly supersedes?: GraphEdgeId;
  readonly recordedAt: IsoTimestamp;
}

export interface TransactionGraph {
  readonly facts: readonly TransactionGraphFact[];
  readonly edges: readonly GraphEdge[];
}
