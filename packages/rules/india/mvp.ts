import type { CanonicalJsonValue } from "@audit-evidence/engine";
import type { AuditRuleDefinition, AuditRulePack, RuleCitation } from "../types.js";
import { countRules } from "../types.js";

const MCA_AUDIT_RULES: RuleCitation = {
  id: "mca-companies-audit-auditors-rules",
  authority: "MCA",
  title: "Companies (Audit and Auditors) Rules, 2014",
  sourceKind: "rules",
  sourceUrl:
    "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/rules.html",
  pinpoint: "Rule 11, including Rule 11(g) audit trail reporting"
};

const MCA_CARO_2020: RuleCitation = {
  id: "mca-caro-2020",
  authority: "MCA",
  title: "Companies (Auditor's Report) Order, 2020",
  sourceKind: "order",
  sourceUrl:
    "https://www.mca.gov.in/content/mca/global/en/acts-rules/ebooks/orders.html",
  pinpoint: "CARO 2020 reporting clauses for applicable companies"
};

const ICAI_STANDARDS_ON_AUDITING: RuleCitation = {
  id: "icai-standards-on-auditing",
  authority: "ICAI",
  title: "Standards on Auditing for audits of historical financial information",
  sourceKind: "standard",
  sourceUrl: "https://www.icai.org/post/auditing-and-assurance-standards-board",
  pinpoint: "SAs governing audit evidence, risk response, documentation, and reporting"
};

const INTERNAL_PATTERN: RuleCitation = {
  id: "audit-evidence-deterministic-control-patterns",
  authority: "Audit Evidence AI",
  title: "Deterministic transaction graph control patterns",
  sourceKind: "internal-control-pattern",
  sourceUrl: "https://github.com/whyharsh/Audit-AI",
  pinpoint: "Control library metadata linked to engine evidence requirements"
};

const EMPTY_FILTERS: readonly CanonicalJsonValue[] = [];
const EVENT_ORDER = ["recordedAt", "eventId"] as const;
const VOUCHER_ORDER = ["voucherDate", "voucherNumber"] as const;

export const INDIA_FINANCIAL_AUDIT_MVP_RULES: readonly AuditRuleDefinition[] = [
  {
    id: "in.financial-audit.rule11g.editlog-disabled-period",
    version: "0.1.0",
    title: "Accounting software edit log enabled for the full year",
    jurisdiction: "IN",
    domain: "companies-act-audit-trail",
    implementationStatus: "implemented",
    engineControlId: "editlog-disabled-period",
    assertion: "integrity",
    applicability:
      "Company financial statement audits where Rule 11(g) audit trail reporting applies.",
    controlIntent:
      "Identify periods where the accounting edit log was disabled during the financial year.",
    populationQuery: {
      entity: "editLogEvents",
      filters: EMPTY_FILTERS,
      orderBy: EVENT_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "EditLogEvent",
        fields: ["eventType", "recordedAt", "effectiveFrom", "effectiveTo"],
        relatedEntities: ["Voucher"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [MCA_AUDIT_RULES, ICAI_STANDARDS_ON_AUDITING]
  },
  {
    id: "in.financial-audit.rule11g.editlog-gap-during-posting",
    version: "0.1.0",
    title: "No edit log silence while vouchers are posted",
    jurisdiction: "IN",
    domain: "companies-act-audit-trail",
    implementationStatus: "implemented",
    engineControlId: "editlog-gap",
    assertion: "integrity",
    applicability:
      "Company financial statement audits where ledger activity must be supported by audit trail records.",
    controlIntent:
      "Find date ranges with voucher posting activity but no corresponding edit log coverage.",
    populationQuery: {
      entity: "editLogEvents",
      filters: EMPTY_FILTERS,
      orderBy: EVENT_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "EditLogEvent",
        fields: ["recordedAt", "eventType", "voucherGuid"],
        relatedEntities: ["Voucher"]
      },
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "voucherKind"],
        relatedEntities: ["EditLogEvent"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [MCA_AUDIT_RULES, ICAI_STANDARDS_ON_AUDITING]
  },
  {
    id: "in.financial-audit.rule11g.editlog-user-attribution",
    version: "0.1.0",
    title: "Every edit log event is attributable to a user",
    jurisdiction: "IN",
    domain: "companies-act-audit-trail",
    implementationStatus: "specified",
    assertion: "integrity",
    applicability:
      "Company financial statement audits where audit trail records include user identity.",
    controlIntent:
      "Flag edit log records that lack a user, role, source system, or immutable event identifier.",
    populationQuery: {
      entity: "editLogEvents",
      filters: EMPTY_FILTERS,
      orderBy: EVENT_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "EditLogEvent",
        fields: ["eventId", "userId", "recordedAt", "voucherGuid"],
        relatedEntities: ["Voucher", "User"]
      }
    ],
    exceptionRateCapBasisPoints: 500,
    citations: [MCA_AUDIT_RULES, ICAI_STANDARDS_ON_AUDITING]
  },
  {
    id: "in.financial-audit.rule11g.editlog-retention-and-tamper-signals",
    version: "0.1.0",
    title: "Audit trail records retained without tamper signals",
    jurisdiction: "IN",
    domain: "companies-act-audit-trail",
    implementationStatus: "specified",
    assertion: "integrity",
    applicability:
      "Company financial statement audits where audit trail retention and non-disablement are reported.",
    controlIntent:
      "Detect deleted, resequenced, duplicated, or backfilled audit trail event identifiers.",
    populationQuery: {
      entity: "editLogEvents",
      filters: EMPTY_FILTERS,
      orderBy: EVENT_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "EditLogEvent",
        fields: ["eventId", "recordedAt", "eventSequence", "eventHash"],
        relatedEntities: ["Voucher", "User"]
      }
    ],
    exceptionRateCapBasisPoints: 500,
    citations: [MCA_AUDIT_RULES, ICAI_STANDARDS_ON_AUDITING]
  },
  {
    id: "in.financial-audit.duplicate-payment-exact",
    version: "0.1.0",
    title: "Duplicate payment by party, document, and amount",
    jurisdiction: "IN",
    domain: "general-ledger-audit",
    implementationStatus: "implemented",
    engineControlId: "duplicate-payment",
    assertion: "existence",
    applicability:
      "Financial statement audits with full-population payment voucher exports.",
    controlIntent:
      "Find payment vouchers with the same party, supporting document reference, and amount.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "voucherKind", op: "equals", value: "payment" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "partyGuid", "documentRef", "totalAmountPaise"],
        relatedEntities: ["Party", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.cutoff-yearend-document-date",
    version: "0.1.0",
    title: "Year-end cutoff between voucher date and evidence date",
    jurisdiction: "IN",
    domain: "financial-statement-assertions",
    implementationStatus: "implemented",
    engineControlId: "cutoff-yearend",
    assertion: "cutoff",
    applicability:
      "Financial statement audits where dated supporting evidence is available for revenue, purchase, payment, or receipt populations.",
    controlIntent:
      "Flag vouchers booked in one period while the linked evidence date belongs to the adjacent period.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "documentRef", op: "exists", value: true }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "evidenceDate", "documentRef", "totalAmountPaise"],
        relatedEntities: ["Document", "Party"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.revenue-cutoff-subsequent-reversal",
    version: "0.1.0",
    title: "Revenue near year-end reversed after year-end",
    jurisdiction: "IN",
    domain: "financial-statement-assertions",
    implementationStatus: "specified",
    assertion: "cutoff",
    applicability:
      "Financial statement audits with sales, credit note, and journal voucher exports.",
    controlIntent:
      "Identify revenue recorded close to year-end that is reversed or credited shortly after year-end.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "accountClass", op: "equals", value: "revenue" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "totalAmountPaise", "reversalRef"],
        relatedEntities: ["VoucherLine", "Party", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.purchase-cutoff-goods-received-after-yearend",
    version: "0.1.0",
    title: "Purchase booked before evidence of receipt",
    jurisdiction: "IN",
    domain: "financial-statement-assertions",
    implementationStatus: "specified",
    assertion: "cutoff",
    applicability:
      "Financial statement audits with purchase vouchers and goods receipt or invoice evidence dates.",
    controlIntent:
      "Flag purchase or expense vouchers recorded before the underlying evidence supports recognition.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "voucherKind", op: "in", value: ["purchase", "journal"] }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "evidenceDate", "documentRef", "totalAmountPaise"],
        relatedEntities: ["VoucherLine", "Party", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.manual-journal-round-sum-period-end",
    version: "0.1.0",
    title: "Round-sum manual journals near period end",
    jurisdiction: "IN",
    domain: "general-ledger-audit",
    implementationStatus: "implemented",
    engineControlId: "manual-journal-risk",
    assertion: "authorization",
    applicability:
      "Financial statement audits with full-population journal voucher exports.",
    controlIntent:
      "Highlight high-risk manual journals using round amounts, materiality, and period-end proximity.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "voucherKind", op: "equals", value: "journal" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "voucherKind", "totalAmountPaise"],
        relatedEntities: ["VoucherLine", "Document", "EditLogEvent"]
      }
    ],
    exceptionRateCapBasisPoints: 1500,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.manual-journal-approval-missing",
    version: "0.1.0",
    title: "Manual journals missing approval evidence",
    jurisdiction: "IN",
    domain: "general-ledger-audit",
    implementationStatus: "specified",
    assertion: "authorization",
    applicability:
      "Financial statement audits where journal approval metadata or approval documents are available.",
    controlIntent:
      "Find manual journals without approver, approval timestamp, or linked approval document.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "voucherKind", op: "equals", value: "journal" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "preparedBy", "approvedBy"],
        relatedEntities: ["Document", "EditLogEvent"]
      }
    ],
    exceptionRateCapBasisPoints: 1500,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.related-party-ledger-scan",
    version: "0.1.0",
    title: "Related party ledger activity requires disclosure support",
    jurisdiction: "IN",
    domain: "financial-statement-assertions",
    implementationStatus: "specified",
    assertion: "completeness",
    applicability:
      "Financial statement audits where related party master data or board-approved related party lists are available.",
    controlIntent:
      "Match ledger parties against related party lists and identify transactions needing disclosure or approval evidence.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "partyRelatedStatus", op: "equals", value: "related" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Party",
        fields: ["name", "pan", "gstin", "relatedPartyBasis"],
        relatedEntities: ["Voucher", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.bank-payment-unmatched",
    version: "0.1.0",
    title: "Book payment not matched to bank debit",
    jurisdiction: "IN",
    domain: "bank-reconciliation",
    implementationStatus: "specified",
    assertion: "existence",
    applicability:
      "Financial statement audits with bank statement imports and book payment vouchers.",
    controlIntent:
      "Flag book payments without a bank debit match after exact, windowed, and bounded combination matching passes.",
    populationQuery: {
      entity: "vouchers",
      filters: [{ field: "voucherKind", op: "equals", value: "payment" }],
      orderBy: VOUCHER_ORDER
    },
    evidenceRequirements: [
      {
        factKind: "Voucher",
        fields: ["voucherDate", "voucherNumber", "bankAccountGuid", "totalAmountPaise"],
        relatedEntities: ["BankStatementLine", "Party"]
      }
    ],
    exceptionRateCapBasisPoints: 2000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.bank-recon-stale-outstanding-item",
    version: "0.1.0",
    title: "Stale outstanding bank reconciliation item",
    jurisdiction: "IN",
    domain: "bank-reconciliation",
    implementationStatus: "specified",
    assertion: "existence",
    applicability:
      "Financial statement audits with bank reconciliation statements and bank statement imports.",
    controlIntent:
      "Identify reconciling items outstanding beyond the configured aging window.",
    populationQuery: {
      entity: "bankReconciliationItems",
      filters: [{ field: "status", op: "equals", value: "outstanding" }],
      orderBy: ["bankAccountGuid", "voucherDate", "voucherNumber"]
    },
    evidenceRequirements: [
      {
        factKind: "BankReconciliationItem",
        fields: ["voucherDate", "voucherNumber", "amountPaise", "outstandingDays"],
        relatedEntities: ["Voucher", "BankStatementLine"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [ICAI_STANDARDS_ON_AUDITING, INTERNAL_PATTERN]
  },
  {
    id: "in.financial-audit.caro-statutory-dues-aging",
    version: "0.1.0",
    title: "Statutory dues outstanding beyond configured aging",
    jurisdiction: "IN",
    domain: "caro-2020",
    implementationStatus: "specified",
    assertion: "completeness",
    applicability:
      "Company financial statement audits where CARO statutory dues reporting is applicable.",
    controlIntent:
      "Identify statutory payable balances that remain unpaid beyond the configured period.",
    populationQuery: {
      entity: "ledgerBalances",
      filters: [{ field: "ledgerCategory", op: "equals", value: "statutory-dues" }],
      orderBy: ["ledgerName", "period"]
    },
    evidenceRequirements: [
      {
        factKind: "Account",
        fields: ["accountName", "closingBalancePaise", "period"],
        relatedEntities: ["Voucher", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [MCA_CARO_2020, ICAI_STANDARDS_ON_AUDITING]
  },
  {
    id: "in.financial-audit.caro-loans-advances-related-parties",
    version: "0.1.0",
    title: "Loans and advances to related parties need recoverability evidence",
    jurisdiction: "IN",
    domain: "caro-2020",
    implementationStatus: "specified",
    assertion: "valuation",
    applicability:
      "Company financial statement audits where CARO loans, investments, guarantees, securities, or advances reporting is applicable.",
    controlIntent:
      "Identify related-party loan or advance balances and payments needing agreement, approval, and recoverability evidence.",
    populationQuery: {
      entity: "ledgerBalances",
      filters: [{ field: "accountClass", op: "equals", value: "loans-advances" }],
      orderBy: ["partyGuid", "accountGuid", "period"]
    },
    evidenceRequirements: [
      {
        factKind: "Account",
        fields: ["accountName", "closingBalancePaise", "partyGuid"],
        relatedEntities: ["Party", "Voucher", "Document"]
      }
    ],
    exceptionRateCapBasisPoints: 1000,
    citations: [MCA_CARO_2020, ICAI_STANDARDS_ON_AUDITING]
  }
];

export const INDIA_FINANCIAL_AUDIT_MVP_RULE_COUNTS = countRules(
  INDIA_FINANCIAL_AUDIT_MVP_RULES
);

export const INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK: AuditRulePack = {
  id: "india-financial-audit-mvp",
  version: "0.1.0",
  title: "India Financial Audit Evidence MVP Rule Pack",
  jurisdiction: "IN",
  summary:
    "Fifteen India financial statement audit evidence controls. Five are executable in the current Tally fixture engine; ten are specified for upcoming source connectors.",
  counts: INDIA_FINANCIAL_AUDIT_MVP_RULE_COUNTS,
  rules: INDIA_FINANCIAL_AUDIT_MVP_RULES
};

export function implementedIndiaFinancialAuditRules(): readonly AuditRuleDefinition[] {
  return INDIA_FINANCIAL_AUDIT_MVP_RULES.filter(
    (rule) => rule.implementationStatus === "implemented"
  );
}

export function specifiedIndiaFinancialAuditRules(): readonly AuditRuleDefinition[] {
  return INDIA_FINANCIAL_AUDIT_MVP_RULES.filter(
    (rule) => rule.implementationStatus === "specified"
  );
}

export function indianFinancialAuditRuleById(
  id: string
): AuditRuleDefinition | undefined {
  return INDIA_FINANCIAL_AUDIT_MVP_RULES.find((rule) => rule.id === id);
}

export {
  INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK as INDIA_MVP_RULE_PACK,
  INDIA_FINANCIAL_AUDIT_MVP_RULES as INDIA_MVP_RULES,
  INDIA_FINANCIAL_AUDIT_MVP_RULE_COUNTS as INDIA_MVP_RULE_COUNTS
};
