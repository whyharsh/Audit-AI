import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  materializeSyntheticTransactionGraph,
  runV0Controls
} from "@audit-evidence/engine";
import { Workspace } from "./workspace/Workspace";
import type { SourceSnippet, WorkspaceData } from "./workspace/types";

const fixturePath = ["fixtures", "synthetic", "bright-ledger-fy2025"];

async function readFixtureText(relativePath: string): Promise<string> {
  const candidates = [
    join(process.cwd(), ...fixturePath, relativePath),
    join(process.cwd(), "..", "..", ...fixturePath, relativePath)
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(`Missing fixture file: ${relativePath}`);
}

function snippetFor(
  text: string,
  needle: string,
  artifactName: string
): SourceSnippet | null {
  const index = text.indexOf(needle);
  if (index < 0) {
    return null;
  }
  const lineNumber = text.slice(0, index).split("\n").length;
  const lines = text.split("\n");
  const start = Math.max(0, lineNumber - 1 - 6);
  const end = Math.min(lines.length, lineNumber + 7);
  return {
    artifactName,
    lineNumber,
    snippet: lines.slice(start, end).join("\n"),
    needle
  };
}

async function loadWorkspaceData(): Promise<WorkspaceData> {
  const [manifestJson, tallyXml, editLogJson, sourceDocumentsJson] =
    await Promise.all([
      readFixtureText("manifest.json"),
      readFixtureText("artifacts/tally-daybook.xml"),
      readFixtureText("artifacts/tally-editlog.json"),
      readFixtureText("artifacts/source-documents.json")
    ]);

  const build = materializeSyntheticTransactionGraph({
    manifestJson,
    tallyXml,
    editLogJson,
    sourceDocumentsJson
  });
  const findings = runV0Controls(build.dataset);

  const artifactText: Record<string, { text: string; name: string }> = {
    Voucher: { text: tallyXml, name: "tally-daybook.xml" },
    Account: { text: tallyXml, name: "tally-daybook.xml" },
    Party: { text: tallyXml, name: "tally-daybook.xml" },
    EditLogEvent: { text: editLogJson, name: "tally-editlog.json" },
    Document: { text: sourceDocumentsJson, name: "source-documents.json" }
  };

  const snippets: Record<string, SourceSnippet> = {};
  for (const entry of build.sourceRefIndex) {
    const artifact = artifactText[entry.factKind];
    if (!artifact) {
      continue;
    }
    const snippet = snippetFor(artifact.text, entry.sourceRef, artifact.name);
    if (snippet) {
      snippets[entry.sourceRef] = snippet;
    }
  }

  const provenanceByRecordId = Object.fromEntries(
    build.provenanceRecords.map((record) => [record.id, record])
  );

  return {
    dataset: build.dataset,
    findings,
    provenanceByRecordId,
    sourceRefIndex: build.sourceRefIndex,
    snippets
  };
}

export default async function Page() {
  const data = await loadWorkspaceData();
  return <Workspace data={data} />;
}
