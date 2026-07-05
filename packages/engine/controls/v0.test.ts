import { describe, expect, test } from "bun:test";

import { parseSyntheticDataset } from "../ingest/synthetic-tally.js";
import { runV0Controls, type V0ControlFinding } from "./v0.js";

interface ExpectedFinding {
  readonly expectedFindingId: string;
  readonly controlId: string;
  readonly status: string;
  readonly severity: string;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly data: unknown;
}

interface ComparableFinding {
  readonly controlId: string;
  readonly status: string;
  readonly severity: string;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly data: unknown;
}

interface ExpectedFindingsFile {
  readonly expectedFindings: readonly ExpectedFinding[];
}

const fixtureRoot = new URL(
  "../../../fixtures/synthetic/bright-ledger-fy2025/",
  import.meta.url
);

describe("v0 synthetic controls", () => {
  test("match the Bright Ledger planted defect manifest", async () => {
    const dataset = parseSyntheticDataset({
      manifestJson: await Bun.file(new URL("manifest.json", fixtureRoot)).text(),
      tallyXml: await Bun.file(
        new URL("artifacts/tally-daybook.xml", fixtureRoot)
      ).text(),
      editLogJson: await Bun.file(
        new URL("artifacts/tally-editlog.json", fixtureRoot)
      ).text(),
      sourceDocumentsJson: await Bun.file(
        new URL("artifacts/source-documents.json", fixtureRoot)
      ).text()
    });
    const expectedFile = (await Bun.file(
      new URL("expected-findings.json", fixtureRoot)
    ).json()) as ExpectedFindingsFile;

    expect(stripFindingIds(runV0Controls(dataset))).toEqual(
      expectedFile.expectedFindings.map(stripExpectedFindingIds)
    );
  });
});

function stripFindingIds(
  findings: readonly V0ControlFinding[]
): readonly ComparableFinding[] {
  return findings.map(({ id: _id, ...finding }) => ({
    controlId: finding.controlId,
    status: finding.status,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
    sourceRefs: finding.sourceRefs,
    data: finding.data
  }));
}

function stripExpectedFindingIds(
  finding: ExpectedFinding
): ComparableFinding {
  const { expectedFindingId: _expectedFindingId, ...rest } = finding;
  return rest;
}
