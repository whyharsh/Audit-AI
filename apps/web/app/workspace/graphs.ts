import type {
  SyntheticDataset,
  SyntheticEditLogEvent,
  SyntheticSourceDocument,
  SyntheticVoucher,
  V0ControlFinding
} from "@audit-evidence/engine";
import type { OverrideRecord } from "./types";
import { CONTROL_META, populationCount } from "./types";
import {
  formatDate,
  formatInrPaise,
  formatTimestamp,
  shortHash
} from "./format";

export const CARD_W = 184;
export const CARD_H = 60;
const COL_PITCH = 228;
const ROW_PITCH = 84;
const PAD = 24;

export type NodeTone = "structure" | "exception" | "override" | "ghost" | "focus";

export interface GraphNodeModel {
  readonly id: string;
  readonly rank: number;
  readonly kindLine: string;
  readonly statusSuffix?: string;
  readonly value: string;
  readonly meta: string;
  readonly tone: NodeTone;
  readonly dashed?: boolean;
  readonly sourceRef?: string;
  x: number;
  y: number;
}

export interface GraphEdgeModel {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
  readonly dashed?: boolean;
  readonly directed: boolean;
}

export interface GraphModel {
  readonly nodes: GraphNodeModel[];
  readonly edges: GraphEdgeModel[];
  readonly width: number;
  readonly height: number;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/* Deterministic layered layout. Ranks map to columns, nodes within a rank
   sort by value then id, columns center vertically. Same input, same picture. */
function layout(
  nodes: readonly Omit<GraphNodeModel, "x" | "y">[],
  edges: readonly GraphEdgeModel[]
): GraphModel {
  const usedRanks = [...new Set(nodes.map((n) => n.rank))].sort((a, b) => a - b);
  const rankColumn = new Map(usedRanks.map((rank, i) => [rank, i]));
  const byColumn = new Map<number, Omit<GraphNodeModel, "x" | "y">[]>();
  for (const node of nodes) {
    const column = rankColumn.get(node.rank) ?? 0;
    const list = byColumn.get(column) ?? [];
    list.push(node);
    byColumn.set(column, list);
  }

  const maxRows = Math.max(...[...byColumn.values()].map((list) => list.length));
  const height = PAD * 2 + (maxRows - 1) * ROW_PITCH + CARD_H;
  const placed: GraphNodeModel[] = [];

  for (const [column, list] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort(
      (a, b) => a.value.localeCompare(b.value) || a.id.localeCompare(b.id)
    );
    const start = PAD + ((maxRows - sorted.length) * ROW_PITCH) / 2;
    sorted.forEach((node, row) => {
      placed.push({ ...node, x: PAD + column * COL_PITCH, y: start + row * ROW_PITCH });
    });
  }

  const width = PAD * 2 + (usedRanks.length - 1) * COL_PITCH + CARD_W;
  return { nodes: placed, edges: [...edges], width, height };
}

interface ResolvedRef {
  readonly kind: "voucher" | "document" | "event";
  readonly value: string;
  readonly meta: string;
}

export function resolveRef(
  ref: string,
  dataset: SyntheticDataset
): ResolvedRef | null {
  const voucher = dataset.vouchers.find((v) => v.id === ref);
  if (voucher) {
    return {
      kind: "voucher",
      value: `${voucher.voucherNumber} · ${formatInrPaise(voucher.totalAmountPaise)}`,
      meta: `${formatDate(voucher.voucherDate)} · ${voucher.voucherKind}`
    };
  }
  const doc = dataset.sourceDocuments.find((d) => d.id === ref);
  if (doc) {
    return {
      kind: "document",
      value: `${doc.documentNumber} · ${formatInrPaise(doc.amountPaise)}`,
      meta: `${doc.documentType} · ${formatDate(doc.documentDate)}`
    };
  }
  const event = dataset.editLogEvents.find((e) => e.id === ref);
  if (event) {
    return {
      kind: "event",
      value: event.eventKind,
      meta: formatTimestamp(event.occurredAt)
    };
  }
  return null;
}

const MAX_FACT_CARDS = 5;

export function buildTrailModel(
  finding: V0ControlFinding,
  dataset: SyntheticDataset,
  override: OverrideRecord | undefined
): GraphModel {
  const meta = CONTROL_META.find((c) => c.id === finding.controlId);
  const nodes: Omit<GraphNodeModel, "x" | "y">[] = [];
  const edges: GraphEdgeModel[] = [];

  const runId = "t:run";
  const popId = "t:pop";
  const findingId = "t:finding";

  nodes.push({
    id: runId,
    rank: 0,
    kindLine: "CONTROL_RUN",
    value: finding.controlId,
    meta: "v0 · deterministic",
    tone: "structure"
  });
  nodes.push({
    id: popId,
    rank: 1,
    kindLine: "POPULATION",
    value: `${populationCount(finding.controlId, dataset)} ${meta?.populationLabel ?? "records"}`,
    meta: "full population, no sampling",
    tone: "structure"
  });
  edges.push({ from: runId, to: popId, label: "selected", directed: true });

  const visibleRefs = finding.sourceRefs.slice(0, MAX_FACT_CARDS);
  const hiddenCount = finding.sourceRefs.length - visibleRefs.length;

  visibleRefs.forEach((ref, index) => {
    const resolved = resolveRef(ref, dataset);
    const nodeId = `t:fact:${ref}`;
    nodes.push({
      id: nodeId,
      rank: 2,
      kindLine: "FACT_REF",
      value: resolved ? truncate(resolved.value, 26) : ref,
      meta: resolved ? resolved.meta : "unresolved reference",
      tone: "structure",
      sourceRef: ref
    });
    edges.push({
      from: popId,
      to: nodeId,
      directed: true,
      ...(index === 0 ? { label: "examined" } : {})
    });
    edges.push({
      from: nodeId,
      to: findingId,
      directed: true,
      ...(index === 0 ? { label: "evidenced-by" } : {})
    });
  });

  if (hiddenCount > 0) {
    const bundleId = "t:fact:bundle";
    nodes.push({
      id: bundleId,
      rank: 2,
      kindLine: "FACT_REF",
      value: `${hiddenCount} more facts`,
      meta: "bundled · all in the trail",
      tone: "ghost",
      dashed: true
    });
    edges.push({ from: popId, to: bundleId, directed: true });
    edges.push({ from: bundleId, to: findingId, directed: true });
  }

  nodes.push({
    id: findingId,
    rank: 3,
    kindLine: "FINDING · ",
    statusSuffix: finding.status,
    value: truncate(finding.title, 26),
    meta: shortHash(finding.id),
    tone: "exception"
  });

  if (override) {
    const overrideId = "t:override";
    nodes.push({
      id: overrideId,
      rank: 4,
      kindLine: "OVERRIDE",
      value: override.actor,
      meta: `${formatTimestamp(override.recordedAt)} · reason recorded`,
      tone: "override"
    });
    edges.push({ from: findingId, to: overrideId, label: "reviewed-by", directed: true });
  }

  const signOffId = "t:signoff";
  nodes.push({
    id: signOffId,
    rank: 5,
    kindLine: "SIGN_OFF",
    value: "pending",
    meta: "sealing is not built yet",
    tone: "ghost",
    dashed: true
  });
  edges.push({
    from: override ? "t:override" : findingId,
    to: signOffId,
    dashed: true,
    directed: true
  });

  return layout(nodes, edges);
}

export function buildNeighborhoodModel(
  focusRef: string,
  dataset: SyntheticDataset,
  siblingRefs: readonly string[]
): GraphModel | null {
  const voucher = dataset.vouchers.find((v) => v.id === focusRef);
  if (voucher) {
    return voucherNeighborhood(voucher, dataset, siblingRefs);
  }
  const doc = dataset.sourceDocuments.find((d) => d.id === focusRef);
  if (doc) {
    return documentNeighborhood(doc, dataset);
  }
  const event = dataset.editLogEvents.find((e) => e.id === focusRef);
  if (event) {
    return eventNeighborhood(event, dataset);
  }
  return null;
}

function voucherNode(
  voucher: SyntheticVoucher,
  tone: NodeTone
): Omit<GraphNodeModel, "x" | "y"> {
  return {
    id: `n:${voucher.id}`,
    rank: 1,
    kindLine: tone === "focus" ? "VOUCHER · SELECTED" : "VOUCHER",
    value: `${voucher.voucherNumber} · ${voucher.voucherKind}`,
    meta: `${formatDate(voucher.voucherDate)} · ${formatInrPaise(voucher.totalAmountPaise)}`,
    tone,
    sourceRef: voucher.id
  };
}

function voucherNeighborhood(
  voucher: SyntheticVoucher,
  dataset: SyntheticDataset,
  siblingRefs: readonly string[]
): GraphModel {
  const nodes: Omit<GraphNodeModel, "x" | "y">[] = [];
  const edges: GraphEdgeModel[] = [];
  const focusId = `n:${voucher.id}`;

  const siblings = siblingRefs
    .filter((ref) => ref !== voucher.id)
    .map((ref) => dataset.vouchers.find((v) => v.id === ref))
    .filter((v): v is SyntheticVoucher => v !== undefined);

  nodes.push(voucherNode(voucher, "focus"));
  for (const sibling of siblings) {
    nodes.push(voucherNode(sibling, "structure"));
  }

  const ledgerIds = new Set<string>();
  for (const v of [voucher, ...siblings]) {
    for (const line of v.lines) {
      if (ledgerIds.has(line.accountGuid)) {
        continue;
      }
      ledgerIds.add(line.accountGuid);
      const ledger = dataset.ledgers.find((l) => l.id === line.accountGuid);
      nodes.push({
        id: `n:acct:${line.accountGuid}`,
        rank: 0,
        kindLine: "ACCOUNT",
        value: truncate(ledger?.name ?? line.accountGuid, 26),
        meta: `ledger · ${ledger?.kind ?? "unknown"}`,
        tone: "structure"
      });
    }
    for (const line of v.lines) {
      const amount = line.debitPaise > 0 ? line.debitPaise : line.creditPaise;
      const side = line.debitPaise > 0 ? "dr" : "cr";
      edges.push({
        from: `n:acct:${line.accountGuid}`,
        to: `n:${v.id}`,
        label: `${side} ${formatInrPaise(amount)}`,
        directed: false
      });
    }
  }

  const partySeen = new Set<string>();
  for (const v of [voucher, ...siblings]) {
    if (v.partyGuid === undefined) {
      continue;
    }
    const party = dataset.parties.find((p) => p.ledgerGuid === v.partyGuid || p.id === v.partyGuid);
    if (party && !partySeen.has(party.id)) {
      partySeen.add(party.id);
      nodes.push({
        id: `n:party:${party.id}`,
        rank: 2,
        kindLine: "PARTY",
        value: truncate(party.name, 26),
        meta: party.gstin ? `GSTIN ${party.gstin}` : "no GSTIN on record",
        tone: "structure"
      });
    }
    if (party) {
      edges.push({ from: `n:${v.id}`, to: `n:party:${party.id}`, label: "payee", directed: false });
    }
  }

  const docSeen = new Set<string>();
  for (const v of [voucher, ...siblings]) {
    if (v.documentRef === undefined) {
      continue;
    }
    const doc = dataset.sourceDocuments.find((d) => d.id === v.documentRef);
    if (doc && !docSeen.has(doc.id)) {
      docSeen.add(doc.id);
      nodes.push({
        id: `n:${doc.id}`,
        rank: 2,
        kindLine: "DOCUMENT",
        value: truncate(`${doc.documentNumber}`, 26),
        meta: `${doc.documentType} · ${formatDate(doc.documentDate)}`,
        tone: "structure",
        sourceRef: doc.id
      });
    }
    if (doc) {
      edges.push({ from: `n:${v.id}`, to: `n:${doc.id}`, label: doc.documentType, directed: false });
    }
  }

  const events = dataset.editLogEvents.filter((e) => e.voucherGuid === voucher.id);
  for (const event of events.slice(0, 2)) {
    nodes.push({
      id: `n:${event.id}`,
      rank: 2,
      kindLine: "EDIT_LOG_EVENT",
      value: event.eventKind,
      meta: `${formatTimestamp(event.occurredAt)}${event.userName ? ` · ${event.userName}` : ""}`,
      tone: "structure",
      sourceRef: event.id
    });
    edges.push({ from: focusId, to: `n:${event.id}`, label: "logged", directed: false });
  }

  const inNeighborhood = 1 + siblings.length;
  const others = dataset.vouchers.length - inNeighborhood;
  if (others > 0) {
    nodes.push({
      id: "n:periphery",
      rank: 3,
      kindLine: "PERIPHERY",
      value: `${others} other vouchers`,
      meta: "dimmed · outside neighborhood",
      tone: "ghost",
      dashed: true
    });
  }

  return layout(nodes, edges);
}

function documentNeighborhood(
  doc: SyntheticSourceDocument,
  dataset: SyntheticDataset
): GraphModel {
  const nodes: Omit<GraphNodeModel, "x" | "y">[] = [];
  const edges: GraphEdgeModel[] = [];

  nodes.push({
    id: `n:${doc.id}`,
    rank: 1,
    kindLine: "DOCUMENT · SELECTED",
    value: truncate(doc.documentNumber, 26),
    meta: `${doc.documentType} · ${formatDate(doc.documentDate)}`,
    tone: "focus",
    sourceRef: doc.id
  });

  for (const guid of doc.voucherGuids) {
    const voucher = dataset.vouchers.find((v) => v.id === guid);
    if (!voucher) {
      continue;
    }
    nodes.push({ ...voucherNode(voucher, "structure"), rank: 0 });
    edges.push({ from: `n:${voucher.id}`, to: `n:${doc.id}`, label: "vouched-by", directed: false });
  }

  return layout(nodes, edges);
}

function eventNeighborhood(
  event: SyntheticEditLogEvent,
  dataset: SyntheticDataset
): GraphModel {
  const nodes: Omit<GraphNodeModel, "x" | "y">[] = [];
  const edges: GraphEdgeModel[] = [];

  nodes.push({
    id: `n:${event.id}`,
    rank: 1,
    kindLine: "EDIT_LOG_EVENT · SELECTED",
    value: event.eventKind,
    meta: `${formatTimestamp(event.occurredAt)}${event.userName ? ` · ${event.userName}` : ""}`,
    tone: "focus",
    sourceRef: event.id
  });

  const voucher = event.voucherGuid
    ? dataset.vouchers.find((v) => v.id === event.voucherGuid)
    : undefined;
  if (voucher) {
    nodes.push({ ...voucherNode(voucher, "structure"), rank: 0 });
    edges.push({ from: `n:${voucher.id}`, to: `n:${event.id}`, label: "logged", directed: false });
  }

  return layout(nodes, edges);
}

export interface ExplorationInput {
  readonly specHash: string;
  readonly entityLabel: string;
  readonly populationSize: number;
  readonly matches: readonly SyntheticVoucher[];
}

export function buildExplorationModel(
  input: ExplorationInput,
  dataset: SyntheticDataset
): GraphModel {
  const nodes: Omit<GraphNodeModel, "x" | "y">[] = [];
  const edges: GraphEdgeModel[] = [];

  nodes.push({
    id: "x:query",
    rank: 0,
    kindLine: "EXPLORATION",
    value: "compiled query",
    meta: `spec ${input.specHash.slice(0, 8)}`,
    tone: "structure"
  });
  nodes.push({
    id: "x:pop",
    rank: 1,
    kindLine: "POPULATION",
    value: `${input.populationSize} ${input.entityLabel}`,
    meta: "full population, no sampling",
    tone: "structure"
  });
  edges.push({ from: "x:query", to: "x:pop", label: "selected", directed: true });

  const visible = input.matches.slice(0, MAX_FACT_CARDS);
  const hidden = input.matches.length - visible.length;

  visible.forEach((voucher, index) => {
    const nodeId = `x:${voucher.id}`;
    nodes.push({
      id: nodeId,
      rank: 2,
      kindLine: "FACT_REF",
      value: `${voucher.voucherNumber} · ${formatInrPaise(voucher.totalAmountPaise)}`,
      meta: `${formatDate(voucher.voucherDate)} · ${voucher.voucherKind}`,
      tone: "structure",
      sourceRef: voucher.id
    });
    edges.push({
      from: "x:pop",
      to: nodeId,
      directed: true,
      ...(index === 0 ? { label: "matched" } : {})
    });
    edges.push({ from: nodeId, to: "x:result", directed: true });
  });

  if (hidden > 0) {
    nodes.push({
      id: "x:bundle",
      rank: 2,
      kindLine: "FACT_REF",
      value: `${hidden} more matches`,
      meta: "bundled · all in the trail",
      tone: "ghost",
      dashed: true
    });
    edges.push({ from: "x:pop", to: "x:bundle", directed: true });
    edges.push({ from: "x:bundle", to: "x:result", directed: true });
  }

  nodes.push({
    id: "x:result",
    rank: 3,
    kindLine: "RESULT",
    value: `${input.matches.length} matches`,
    meta: "exploration · not a control finding",
    tone: input.matches.length > 0 ? "exception" : "structure"
  });

  return layout(nodes, edges);
}
