import type {
  Provenance,
  SyntheticDataset,
  SyntheticSourceRefIndexEntry,
  V0ControlFinding
} from "@audit-evidence/engine";

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
  readonly title: string;
  readonly assertion: string;
  readonly populationLabel: string;
}

export const CONTROL_META: readonly ControlMeta[] = [
  {
    id: "editlog-disabled-period",
    title: "Edit log disabled period",
    assertion: "integrity",
    populationLabel: "edit log events and vouchers"
  },
  {
    id: "editlog-gap",
    title: "Edit log silence gaps",
    assertion: "integrity",
    populationLabel: "edit log events and vouchers"
  },
  {
    id: "duplicate-payment",
    title: "Duplicate payments",
    assertion: "existence",
    populationLabel: "payment vouchers"
  },
  {
    id: "cutoff-yearend",
    title: "Year-end cutoff",
    assertion: "cutoff",
    populationLabel: "vouchers with linked documents"
  },
  {
    id: "manual-journal-risk",
    title: "Manual journal risk",
    assertion: "authorization",
    populationLabel: "journal vouchers"
  }
];

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
