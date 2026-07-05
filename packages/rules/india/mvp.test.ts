import { describe, expect, test } from "bun:test";
import {
  implementedIndiaFinancialAuditRules,
  INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK,
  INDIA_FINANCIAL_AUDIT_MVP_RULES,
  specifiedIndiaFinancialAuditRules
} from "./mvp.js";

describe("India financial audit MVP rule pack", () => {
  test("defines exactly the MVP financial audit rule count", () => {
    expect(INDIA_FINANCIAL_AUDIT_MVP_RULE_PACK.counts).toEqual({
      total: 15,
      implemented: 5,
      specified: 10
    });
    expect(INDIA_FINANCIAL_AUDIT_MVP_RULES).toHaveLength(15);
    expect(implementedIndiaFinancialAuditRules()).toHaveLength(5);
    expect(specifiedIndiaFinancialAuditRules()).toHaveLength(10);
  });

  test("keeps implemented controls aligned with the current engine", () => {
    expect(
      implementedIndiaFinancialAuditRules().map((rule) => rule.engineControlId)
    ).toEqual([
      "editlog-disabled-period",
      "editlog-gap",
      "duplicate-payment",
      "cutoff-yearend",
      "manual-journal-risk"
    ]);
  });

  test("has unique ids and cites an evidence source for every rule", () => {
    const ids = new Set(INDIA_FINANCIAL_AUDIT_MVP_RULES.map((rule) => rule.id));
    expect(ids.size).toBe(INDIA_FINANCIAL_AUDIT_MVP_RULES.length);

    for (const rule of INDIA_FINANCIAL_AUDIT_MVP_RULES) {
      expect(rule.id.startsWith("in.financial-audit.")).toBe(true);
      expect(rule.citations.length).toBeGreaterThan(0);
      expect(rule.evidenceRequirements.length).toBeGreaterThan(0);
    }
  });
});
