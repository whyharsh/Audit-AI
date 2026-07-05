import { describe, expect, test } from "bun:test";

import { runV0Controls } from "../controls/v0.js";
import { materializeSyntheticTransactionGraph } from "./synthetic-transaction-graph.js";

const fixtureRoot = new URL(
  "../../../fixtures/synthetic/bright-ledger-fy2025/",
  import.meta.url
);

describe("materializeSyntheticTransactionGraph", () => {
  test("builds graph facts with provenance for every control source ref", async () => {
    const build = materializeSyntheticTransactionGraph({
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
    const factIds = new Set(
      build.transactionGraph.facts.map((fact) => fact.id)
    );
    const provenanceIds = new Set(
      build.provenanceRecords.map((record) => record.id)
    );
    const sourceRefs = new Set(
      runV0Controls(build.dataset).flatMap((finding) => finding.sourceRefs)
    );

    expect(build.transactionGraph.facts).toHaveLength(
      build.dataset.ledgers.length +
        build.dataset.parties.length +
        build.dataset.vouchers.length +
        build.dataset.vouchers.reduce(
          (count, voucher) => count + voucher.lines.length,
          0
        ) +
        build.dataset.editLogEvents.length +
        build.dataset.sourceDocuments.length
    );
    expect(
      build.transactionGraph.facts.every((fact) =>
        provenanceIds.has(fact.provenanceRecordId)
      )
    ).toBe(true);
    expect(
      build.transactionGraph.edges.every(
        (edge) => factIds.has(edge.from.id) && factIds.has(edge.to.id)
      )
    ).toBe(true);
    expect(
      Array.from(sourceRefs).every((sourceRef) =>
        build.sourceRefIndex.some((entry) => entry.sourceRef === sourceRef)
      )
    ).toBe(true);
  });
});
