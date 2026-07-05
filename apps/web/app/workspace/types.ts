import type {
  Provenance,
  SyntheticDataset,
  SyntheticSourceRefIndexEntry,
  V0ControlFinding
} from "@audit-evidence/engine";
import {
  INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK,
  INDIA_FINANCIAL_AUDIT_MVP_RULES
} from "@audit-evidence/rules";
import type {
  AuditRuleDefinition,
  RuleImplementationStatus
} from "@audit-evidence/rules";

export interface SourceSnippet {
  readonly artifactName: string;
  readonly lineNumber: number;
  readonly snippet: string;
  readonly needle: string;
}

export interface WorkspaceData {
  readonly dataset: SyntheticDataset;
  readonly findings: readonly V0ControlFinding[];
  readonly provenanceByRecordId: Readonly<Record<string, Provenance>>;
  readonly sourceRefIndex: readonly SyntheticSourceRefIndexEntry[];
  readonly snippets: Readonly<Record<string, SourceSnippet>>;
}

export interface OverrideRecord {
  readonly findingId: string;
  readonly reason: string;
  readonly materiality: string;
  readonly actor: string;
  readonly recordedAt: string;
}

export interface ControlMeta {
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly assertion: string;
  readonly populationLabel: string;
  readonly domain: string;
  readonly implementationStatus: RuleImplementationStatus;
  readonly applicability: string;
  readonly controlIntent: string;
  readonly citations: AuditRuleDefinition["citations"];
}

export const RULE_PACK_META = INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK;

export const CONTROL_META: readonly ControlMeta[] =
  INDIA_FINANCIAL_AUDIT_MVP_RULES.map((rule) => ({
    id: rule.engineControlId ?? rule.id,
    ruleId: rule.id,
    title: rule.title,
    assertion: rule.assertion,
    populationLabel: populationLabelForRule(rule),
    domain: rule.domain,
    implementationStatus: rule.implementationStatus,
    applicability: rule.applicability,
    controlIntent: rule.controlIntent,
    citations: rule.citations
  }));

export function populationCount(
  controlId: string,
  dataset: SyntheticDataset
): number {
  switch (controlId) {
    case "editlog-disabled-period":
    case "editlog-gap":
      return dataset.editLogEvents.length;
    case "duplicate-payment":
      return dataset.vouchers.filter((v) => v.voucherKind === "payment").length;
    case "cutoff-yearend":
      return dataset.vouchers.filter((v) => v.documentRef !== undefined).length;
    case "manual-journal-risk":
      return dataset.vouchers.filter((v) => v.voucherKind === "journal").length;
    default:
      return dataset.vouchers.length;
  }
}

function populationLabelForRule(rule: AuditRuleDefinition): string {
  switch (rule.populationQuery.entity) {
    case "editLogEvents":
      return "edit log events and vouchers";
    case "vouchers":
      return "voucher population";
    case "ledgerBalances":
      return "ledger balances";
    case "bankReconciliationItems":
      return "bank reconciliation items";
    default:
      return rule.populationQuery.entity;
  }
}
