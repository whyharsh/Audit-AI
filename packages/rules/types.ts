import type {
  ControlAssertion,
  EvidenceRequirement,
  PopulationQuery
} from "@audit-evidence/engine";

export type RuleJurisdiction = "IN";

export type IndiaRuleDomain =
  | "companies-act-audit-trail"
  | "caro-2020"
  | "bank-reconciliation"
  | "financial-statement-assertions"
  | "general-ledger-audit"
  | "standards-on-auditing";

export type RuleImplementationStatus = "implemented" | "specified";

export type RuleSourceAuthority =
  | "MCA"
  | "Income Tax Department"
  | "GSTN"
  | "ICAI"
  | "Audit Evidence AI";

export type RuleSourceKind =
  | "rules"
  | "order"
  | "form"
  | "portal"
  | "standard"
  | "internal-control-pattern";

export interface RuleCitation {
  readonly id: string;
  readonly authority: RuleSourceAuthority;
  readonly title: string;
  readonly sourceKind: RuleSourceKind;
  readonly sourceUrl: string;
  readonly pinpoint: string;
}

export interface AuditRuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly jurisdiction: RuleJurisdiction;
  readonly domain: IndiaRuleDomain;
  readonly implementationStatus: RuleImplementationStatus;
  readonly engineControlId?: string;
  readonly assertion: ControlAssertion;
  readonly applicability: string;
  readonly controlIntent: string;
  readonly populationQuery: PopulationQuery;
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly exceptionRateCapBasisPoints: number;
  readonly citations: readonly RuleCitation[];
}

export interface RulePackCounts {
  readonly total: number;
  readonly implemented: number;
  readonly specified: number;
}

export interface AuditRulePack {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly jurisdiction: RuleJurisdiction;
  readonly summary: string;
  readonly counts: RulePackCounts;
  readonly rules: readonly AuditRuleDefinition[];
}

export function countRules(
  rules: readonly AuditRuleDefinition[]
): RulePackCounts {
  const implemented = rules.filter(
    (rule) => rule.implementationStatus === "implemented"
  ).length;
  return {
    total: rules.length,
    implemented,
    specified: rules.length - implemented
  };
}
