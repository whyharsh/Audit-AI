import type {
  CanonicalJsonValue,
  ContentHash,
  ControlId,
  ControlRunId,
  EngagementRef,
  FinancialYear,
  FindingId,
  GraphFactId,
  IngestionRunId,
  IsoTimestamp,
  SemverString
} from "./primitives.js";

export type ControlAssertion =
  | "existence"
  | "completeness"
  | "cutoff"
  | "authorization"
  | "valuation"
  | "integrity";

export type FindingStatus =
  | "PASS_SUMMARY"
  | "EXCEPTION"
  | "UNTESTABLE"
  | "MISCONFIGURED";

export type FindingSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export interface PopulationQuery {
  readonly entity: string;
  readonly filters: readonly CanonicalJsonValue[];
  readonly orderBy: readonly string[];
}

export interface EvidenceRequirement {
  readonly factKind: string;
  readonly fields: readonly string[];
  readonly relatedEntities: readonly string[];
}

export type ControlParams = Readonly<Record<string, CanonicalJsonValue>>;

export interface ControlContext extends EngagementRef {
  readonly financialYear: FinancialYear;
  readonly asOf: IsoTimestamp;
}

export interface PopulationSnapshot<TFact = unknown> {
  readonly query: PopulationQuery;
  readonly facts: readonly TFact[];
  readonly snapshotHash: ContentHash;
}

export interface RawFinding {
  readonly status: FindingStatus;
  readonly title: string;
  readonly detail: string;
  readonly severity: FindingSeverity;
  readonly factRefs: readonly GraphFactId[];
  readonly data: CanonicalJsonValue;
}

export type ControlTest<
  TParams extends ControlParams = ControlParams,
  TFact = unknown
> = (
  population: PopulationSnapshot<TFact>,
  params: TParams,
  context: ControlContext
) => readonly RawFinding[];

export interface ControlDefinition<
  TParams extends ControlParams = ControlParams,
  TFact = unknown
> {
  readonly id: ControlId;
  readonly version: SemverString;
  readonly title: string;
  readonly assertion: ControlAssertion;
  readonly populationQuery: PopulationQuery;
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly exceptionRateCap: number;
  readonly test: ControlTest<TParams, TFact>;
}

export interface ControlRun extends EngagementRef {
  readonly id: ControlRunId;
  readonly controlId: ControlId;
  readonly controlVersion: SemverString;
  readonly paramsHash: ContentHash;
  readonly populationSnapshotHash: ContentHash;
  readonly ingestionRunId: IngestionRunId;
  readonly startedAt: IsoTimestamp;
  readonly completedAt?: IsoTimestamp;
}

export interface Finding extends EngagementRef {
  readonly id: FindingId;
  readonly controlRunId: ControlRunId;
  readonly status: FindingStatus;
  readonly title: string;
  readonly detail: string;
  readonly severity: FindingSeverity;
  readonly factRefs: readonly GraphFactId[];
  readonly canonicalHash: ContentHash;
  readonly data: CanonicalJsonValue;
}
