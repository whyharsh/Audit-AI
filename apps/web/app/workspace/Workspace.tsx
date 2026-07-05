"use client";

import { useMemo, useState } from "react";
import { runV0Controls } from "@audit-evidence/engine";
import type { CanonicalJsonValue } from "@audit-evidence/engine/types";
import type { GraphModel, GraphNodeModel } from "./graphs";
import {
  buildEvidenceLayerModel,
  buildExplorationModel,
  buildTransactionGraphModel,
  transactionNodeIdForSourceRef
} from "./graphs";
import type { CompiledQuestion, QuestionSpec } from "./explore";
import { compileQuestion, compileQuestionSpec } from "./explore";
import { GraphSpace } from "./GraphSpace";
import type { OverrideRecord, SourceSnippet, WorkspaceData } from "./types";
import { CONTROL_META, RULE_PACK_META } from "./types";
import {
  formatDate,
  formatInrPaise,
  materialityPercent,
  shortHash
} from "./format";

type Layer = "evidence" | "transactions" | "documents";

interface Selection {
  readonly type: "finding" | "exploration";
  readonly findingId?: string;
}

type ModelAskResponse =
  | {
      readonly ok: true;
      readonly spec: QuestionSpec;
      readonly reason: string;
      readonly confidence: number;
      readonly model: string;
    }
  | { readonly ok: false; readonly message: string };

interface UploadedDocument {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly linkedSourceRef?: string;
}

const SESSION_ACTOR = "CA R. Sharma, partner";

export function Workspace({ data }: { readonly data: WorkspaceData }) {
  const { dataset, findings } = data;

  const findingsByControl = useMemo(() => {
    const map = new Map<string, typeof findings>();
    for (const meta of CONTROL_META) {
      map.set(
        meta.id,
        findings.filter((f) => f.controlId === meta.id)
      );
    }
    return map;
  }, [findings]);

  const firstWithFindings =
    CONTROL_META.find((m) => (findingsByControl.get(m.id)?.length ?? 0) > 0) ??
    CONTROL_META[0];

  const [activeControlId, setActiveControlId] = useState<string>(
    firstWithFindings?.id ?? ""
  );
  const [selection, setSelection] = useState<Selection>(() => {
    const first = findingsByControl.get(firstWithFindings?.id ?? "")?.[0];
    return first
      ? { type: "finding", findingId: first.id }
      : { type: "finding" };
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("evidence");
  const [focusRef, setFocusRef] = useState<string | null>(null);
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<readonly UploadedDocument[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, OverrideRecord>>({});
  const [reason, setReason] = useState("");
  const [materiality, setMateriality] = useState("");
  const [replayNote, setReplayNote] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [compiled, setCompiled] = useState<CompiledQuestion | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [exploration, setExploration] = useState<{
    compiled: CompiledQuestion;
    matches: ReturnType<CompiledQuestion["run"]>;
  } | null>(null);

  const selectedFinding =
    selection.type === "finding" && selection.findingId
      ? findings.find((f) => f.id === selection.findingId) ?? null
      : null;
  const activeRuleMeta =
    CONTROL_META.find((meta) => meta.id === activeControlId) ?? null;

  const explorationEvidenceModel: GraphModel | null = useMemo(() => {
    if (selection.type === "exploration" && exploration) {
      return buildExplorationModel(
        {
          specHash: exploration.compiled.specHash,
          entityLabel: exploration.compiled.entityLabel,
          populationSize: exploration.compiled.populationSize,
          matches: [...exploration.matches]
        },
        dataset
      );
    }
    return null;
  }, [selection, exploration, dataset]);

  const ruleEvidenceModel: GraphModel | null = useMemo(
    () =>
      buildEvidenceLayerModel({
        rule: activeRuleMeta,
        findings: findingsByControl.get(activeControlId) ?? [],
        dataset,
        overrides
      }),
    [activeRuleMeta, findingsByControl, activeControlId, dataset, overrides]
  );

  const transactionModel: GraphModel = useMemo(
    () => buildTransactionGraphModel(dataset),
    [dataset]
  );

  const activeModel =
    layer === "evidence"
      ? explorationEvidenceModel ?? ruleEvidenceModel
      : layer === "transactions"
        ? transactionModel
        : null;
  const snippet = sourceRef ? data.snippets[sourceRef] : undefined;

  const selectedNode: GraphNodeModel | null =
    (activeModel?.nodes.find((n) => n.id === selectedNodeId) as GraphNodeModel | undefined) ?? null;

  const provenanceForSelected = useMemo(() => {
    const ref = selectedNode?.sourceRef;
    if (!ref) {
      return null;
    }
    const entry = data.sourceRefIndex.find((e) => e.sourceRef === ref);
    if (!entry) {
      return null;
    }
    return data.provenanceByRecordId[entry.provenanceRecordId] ?? null;
  }, [selectedNode, data]);

  function selectFinding(findingId: string, controlId: string) {
    setActiveControlId(controlId);
    setSelection({ type: "finding", findingId });
    setSelectedNodeId(`ev:finding:${findingId}`);
    setLayer("evidence");
    setFocusRef(null);
    setSourceRef(null);
    setReplayNote(null);
    setReason("");
    setMateriality("");
  }

  function descend(node: GraphNodeModel) {
    setSelectedNodeId(node.id);
    if (layer === "evidence" && node.sourceRef) {
      setFocusRef(node.sourceRef);
      setSelectedNodeId(transactionNodeIdForSourceRef(node.sourceRef, dataset));
      setLayer("transactions");
      return;
    }
    if (layer === "evidence") {
      setLayer("transactions");
      return;
    }
    if (layer === "transactions" && node.sourceRef) {
      setSourceRef(node.sourceRef);
      setLayer("documents");
    }
  }

  function ascend() {
    if (layer === "documents") {
      setLayer("transactions");
      return;
    }
    if (layer === "transactions") {
      setLayer("evidence");
    }
  }

  function selectCanvasNode(node: GraphNodeModel) {
    setSelectedNodeId(node.id);
    if (layer === "evidence" && node.sourceRef) {
      setFocusRef(node.sourceRef);
      setSelectedNodeId(transactionNodeIdForSourceRef(node.sourceRef, dataset));
      setLayer("transactions");
      return;
    }
    if (layer === "transactions" && node.sourceRef) {
      setFocusRef(node.sourceRef);
      setSourceRef(node.sourceRef);
      setLayer("documents");
    }
  }

  function recordOverride() {
    if (!selectedFinding) {
      return;
    }
    const record: OverrideRecord = {
      findingId: selectedFinding.id,
      reason: reason.trim(),
      materiality: materiality.trim(),
      actor: SESSION_ACTOR,
      recordedAt: new Date().toISOString()
    };
    setOverrides((prev) => ({ ...prev, [selectedFinding.id]: record }));
    setReason("");
    setMateriality("");
  }

  function replay() {
    if (!selectedFinding) {
      return;
    }
    const rerun = runV0Controls(dataset);
    const match = rerun.find((f) => f.id === selectedFinding.id);
    setReplayNote(
      match
        ? `Reproduced. ${rerun.length} findings recomputed in this browser; id ${shortHash(selectedFinding.id)} matches byte for byte.`
        : "Replay mismatch. The finding id did not reproduce. Do not rely on this file until this is explained."
    );
  }

  function compile() {
    setCompileError(null);
    setCompiled(null);
    const result = compileQuestion(question, dataset);
    if (result.ok) {
      setCompiled(result.compiled);
    } else {
      setCompileError(result.message);
    }
  }

  async function askModel() {
    setCompileError(null);
    setCompiled(null);
    setModelBusy(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          context: buildAskContext(data)
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | ModelAskResponse
        | null;

      if (!payload || payload.ok === false) {
        setCompileError(
          payload?.message ?? "The model did not return a usable compiler response."
        );
        return;
      }

      const result = compileQuestionSpec(question, payload.spec, dataset, {
        compiledBy: "model",
        model: payload.model,
        modelReason: payload.reason,
        confidence: payload.confidence
      });
      if (result.ok) {
        setCompiled(result.compiled);
      } else {
        setCompileError(result.message);
      }
    } catch {
      setCompileError("Model compilation failed. Check the server log and API key.");
    } finally {
      setModelBusy(false);
    }
  }

  function runCompiled() {
    if (!compiled) {
      return;
    }
    const matches = compiled.run();
    setExploration({ compiled, matches });
    setSelection({ type: "exploration" });
    setSelectedNodeId("x:result");
    setLayer("evidence");
    setFocusRef(null);
    setSourceRef(null);
  }

  function registerUploads(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    const next = Array.from(files).map((file, index) => ({
      id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
      name: file.name,
      size: file.size,
      type: file.type || "unknown",
      ...(sourceRef ? { linkedSourceRef: sourceRef } : {})
    }));
    setUploadedDocuments((prev) => [...prev, ...next]);
  }

  const overrideValid = reason.trim().length >= 40 && materiality.trim().length >= 20;
  const currentOverride = selectedFinding ? overrides[selectedFinding.id] : undefined;

  const fy = dataset.engagement.financialYear;

  return (
    <div className="app">
      <header className="topbar">
        <div className="engagement">
          <span className="firm">{dataset.engagement.firmId}</span>
          <span className="sep">·</span>
          {dataset.engagement.clientLegalName}
          <span className="sep">·</span>
          FY {fy.startsOn.slice(0, 4)}-{fy.endsOn.slice(2, 4)}
        </div>
        <div className="topbar-right">
          <span className="seal-state">Unsealed</span>
        </div>
      </header>

      <div className="workspace">
        <aside className="rail">
          <p className="rail-meta">{dataset.fixtureName}</p>
          <p className="rail-meta">
            Materiality {formatInrPaise(dataset.engagement.materialityPaise)} ·{" "}
            {dataset.vouchers.length} vouchers · {dataset.editLogEvents.length} edit log events
          </p>

          <h2>Ask</h2>
          <div className="ask-row">
            <input
              value={question}
              placeholder="round sum journals near year end"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  compile();
                }
              }}
            />
            <button className="btn" type="button" onClick={compile}>
              Compile
            </button>
            <button
              className="btn"
              type="button"
              disabled={modelBusy}
              onClick={askModel}
            >
              {modelBusy ? "Asking" : "Ask model"}
            </button>
          </div>
          {compileError ? <p className="ask-note">{compileError}</p> : null}
          {compiled ? (
            <div className="compiled">
              <span className="mute small">
                {compiled.compiledBy === "model"
                  ? `Model compiled query via ${compiled.model ?? "OpenAI"}`
                  : "Compiled query, shown before execution"}
              </span>
              {compiled.modelReason ? (
                <p className="ask-note">
                  {compiled.modelReason}
                  {compiled.confidence !== undefined
                    ? ` Confidence ${compiled.confidence}/100.`
                    : ""}
                </p>
              ) : null}
              <pre>{compiled.specJson}</pre>
              <button className="btn primary" type="button" onClick={runCompiled}>
                Run compiled query
              </button>
            </div>
          ) : null}
          {exploration && selection.type === "exploration" ? (
            <p className="ask-note">
              {exploration.matches.length} matches. This exploration is its own
              trail; it does not change any control finding.
            </p>
          ) : null}

          <h2>Rules</h2>
          <p className="rail-meta">
            India financial audit pack: {RULE_PACK_META.counts.total} rules,{" "}
            {RULE_PACK_META.counts.implemented} executable,{" "}
            {RULE_PACK_META.counts.specified} specified.
          </p>
          {CONTROL_META.map((meta) => {
            const list = findingsByControl.get(meta.id) ?? [];
            return (
              <button
                key={meta.id}
                type="button"
                className={`rule${meta.id === activeControlId && selection.type === "finding" ? " active" : ""}`}
                onClick={() => {
                  const first = list[0];
                  if (first) {
                    selectFinding(first.id, meta.id);
                  } else {
                    setActiveControlId(meta.id);
                    setSelection({ type: "finding" });
                    setSelectedNodeId(`ev:rule:${meta.id}`);
                    setLayer("evidence");
                    setFocusRef(null);
                    setSourceRef(null);
                  }
                }}
              >
                <span className="rule-title">{meta.title}</span>
                <span className="rule-meta">
                  <span className="mono">
                    {meta.implementationStatus === "implemented"
                      ? meta.id
                      : "specified"}{" "}
                    · v0 · {meta.assertion}
                  </span>
                  <span className={`rule-count${list.length === 0 ? " zero" : ""}`}>
                    {meta.implementationStatus === "specified"
                      ? "specified"
                      : list.length === 0
                        ? "no exceptions"
                        : `${list.length} exception${list.length > 1 ? "s" : ""}`}
                  </span>
                </span>
              </button>
            );
          })}

          {activeRuleMeta ? (
            <div className="detail-block">
              <dl>
                <dt>Rule source</dt>
                <dd>{activeRuleMeta.domain}</dd>
                <dt>Status</dt>
                <dd>{activeRuleMeta.implementationStatus}</dd>
                <dt>Intent</dt>
                <dd>{activeRuleMeta.controlIntent}</dd>
                <dt>Citations</dt>
                <dd>
                  {activeRuleMeta.citations
                    .map((citation) => citation.authority)
                    .join(", ")}
                </dd>
              </dl>
            </div>
          ) : null}

          <h2>Findings · {activeControlId}</h2>
          {(findingsByControl.get(activeControlId) ?? []).length === 0 ? (
            <p className="rail-meta">
              {activeRuleMeta?.implementationStatus === "specified"
                ? "Specified for the financial audit rule pack. The source connector or deterministic executor is not built yet."
                : "Population tested, nothing to report."}
            </p>
          ) : null}
          {(findingsByControl.get(activeControlId) ?? []).map((finding) => {
            const amount = amountPaiseFromData(finding.data);
            const overridden = overrides[finding.id] !== undefined;
            return (
              <button
                key={finding.id}
                type="button"
                className={`finding-row${selection.findingId === finding.id ? " active" : ""}`}
                onClick={() => selectFinding(finding.id, finding.controlId)}
              >
                <span className={`status-word ${overridden ? "overridden" : finding.status}`}>
                  {overridden ? "OVERRIDDEN" : finding.status}
                </span>
                <div className="t">{finding.title}</div>
                <div className="m">
                  {shortHash(finding.id)} · severity {finding.severity}
                  {amount !== null
                    ? ` · ${materialityPercent(amount, dataset.engagement.materialityPaise)} of materiality`
                    : ""}
                </div>
              </button>
            );
          })}

          {selectedNode && provenanceForSelected ? (
            <>
              <h2>Provenance</h2>
              <div className="detail-block">
                <dl>
                  <dt>Artifact</dt>
                  <dd>{shortHash(provenanceForSelected.artifactHash)}</dd>
                  <dt>Parser</dt>
                  <dd>
                    {provenanceForSelected.parser.name}{" "}
                    {provenanceForSelected.parser.version}
                  </dd>
                  <dt>Location</dt>
                  <dd>{JSON.stringify(provenanceForSelected.sourceLocation)}</dd>
                  <dt>Ingestion</dt>
                  <dd>{provenanceForSelected.ingestionRunId}</dd>
                </dl>
                <div className="btn-row">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      if (selectedNode) {
                        descend(selectedNode);
                      }
                    }}
                  >
                    Descend
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {selectedFinding && selection.type === "finding" ? (
            <>
              <h2>Disposition</h2>
              <div className="detail-block">
                <p className="rail-meta">{selectedFinding.detail}</p>
                <div className="btn-row">
                  <button className="btn" type="button" onClick={replay}>
                    Replay control
                  </button>
                </div>
                {replayNote ? (
                  <p
                    className={`replay-result ${replayNote.startsWith("Reproduced") ? "ok" : "bad"}`}
                  >
                    {replayNote}
                  </p>
                ) : null}
              </div>

              {currentOverride ? (
                <div className="wp-preview">
                  <div className="wp-head">
                    As it appears in the workpaper
                  </div>
                  Overridden by {currentOverride.actor},{" "}
                  {formatDate(currentOverride.recordedAt)}.{" "}
                  {currentOverride.reason} {currentOverride.materiality}
                </div>
              ) : (
                <div className="override-form">
                  <label htmlFor="ov-reason">Override reason</label>
                  <textarea
                    id="ov-reason"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p className="char-hint">
                    {reason.trim().length} of 40 characters minimum
                  </p>
                  <label htmlFor="ov-mat">Materiality justification</label>
                  <textarea
                    id="ov-mat"
                    rows={2}
                    value={materiality}
                    onChange={(e) => setMateriality(e.target.value)}
                  />
                  <p className="char-hint">
                    {materiality.trim().length} of 20 characters minimum
                  </p>
                  {reason.trim().length > 0 ? (
                    <div className="wp-preview">
                      <div className="wp-head">
                        As it will appear in the workpaper
                      </div>
                      Overridden by {SESSION_ACTOR}. {reason.trim()}{" "}
                      {materiality.trim()}
                    </div>
                  ) : null}
                  <div className="btn-row">
                    <button
                      className="btn primary"
                      type="button"
                      disabled={!overrideValid}
                      onClick={recordOverride}
                    >
                      Record override
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </aside>

        {collapsed ? (
          <div className="collapse-rail">
            <button type="button" onClick={() => setCollapsed(false)}>
              Open graph space
            </button>
          </div>
        ) : (
          <section className="graphpane">
            <div className="gp-chrome">
              <div className="altitude">
                <button
                  type="button"
                  className={layer === "evidence" ? "here" : ""}
                  onClick={() => setLayer("evidence")}
                >
                  Evidence
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={layer === "transactions" ? "here" : ""}
                  onClick={() => setLayer("transactions")}
                >
                  Transaction graph
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={layer === "documents" ? "here" : ""}
                  onClick={() => setLayer("documents")}
                >
                  Document intelligence
                </button>
              </div>
              <button
                className="btn quiet"
                type="button"
                disabled={layer === "evidence"}
                onClick={ascend}
              >
                Ascend
              </button>
              <button
                className="btn quiet"
                type="button"
                disabled={layer === "documents" || (layer === "transactions" && !selectedNode?.sourceRef)}
                onClick={() => {
                  if (selectedNode) {
                    descend(selectedNode);
                  } else if (layer === "evidence") {
                    setLayer("transactions");
                  }
                }}
              >
                Descend
              </button>
              <span className="gp-spacer" />
              <span className="gp-hint">
                click descends when the node has evidence · drag pans · scroll zooms
              </span>
              <button className="btn quiet" type="button" onClick={() => setCollapsed(true)}>
                Collapse
              </button>
            </div>

            {layer === "documents" ? (
              <DocumentIntelligence
                data={data}
                sourceRef={sourceRef}
                snippet={snippet}
                uploads={uploadedDocuments}
                onUpload={registerUploads}
              />
            ) : (
              <GraphSpace
                model={activeModel}
                selectedId={selectedNodeId}
                emptyMessage={
                  layer === "evidence"
                    ? "Choose a rule or a finding to draw the evidence layer."
                    : "The transaction graph has no nodes to show."
                }
                onSelect={selectCanvasNode}
                onDescend={descend}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function DocumentIntelligence({
  data,
  sourceRef,
  snippet,
  uploads,
  onUpload
}: {
  readonly data: WorkspaceData;
  readonly sourceRef: string | null;
  readonly snippet: SourceSnippet | undefined;
  readonly uploads: readonly UploadedDocument[];
  readonly onUpload: (files: FileList | null) => void;
}) {
  const title = sourceRef ? sourceTitle(data, sourceRef) : null;
  const related = sourceRef ? relatedDocuments(data, sourceRef) : [];
  const linkedUploads = uploads.filter((upload) =>
    sourceRef ? upload.linkedSourceRef === sourceRef : upload.linkedSourceRef === undefined
  );

  return (
    <div className="source-view doc-intel">
      <div className="doc-head">
        <div>
          <p className="source-head">
            <span className="name">Document intelligence</span>
            {title ? ` / ${title}` : " / no node selected"}
          </p>
          <p className="doc-note">
            Evidence opened from the transaction canvas stays linked to the node
            that produced it.
          </p>
        </div>
        <label className="btn" htmlFor="doc-upload">
          Upload document
        </label>
        <input
          id="doc-upload"
          className="file-input"
          type="file"
          multiple
          onChange={(event) => {
            onUpload(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>

      <div className="doc-grid">
        <section className="doc-panel">
          <h3>Source Preview</h3>
          {snippet ? (
            <>
              <p className="source-head">
                <span className="name">{snippet.artifactName}</span>{" "}
                / line {snippet.lineNumber} / fixture artifact in custody
              </p>
              <pre>{snippet.snippet}</pre>
            </>
          ) : (
            <p className="source-head">
              Select a voucher or document node to open its source evidence.
            </p>
          )}
        </section>

        <section className="doc-panel">
          <h3>Linked Documents</h3>
          {related.length > 0 ? (
            related.map((doc) => (
              <div className="doc-row" key={doc.id}>
                <div>
                  <strong>{doc.documentNumber}</strong>
                  <span>{doc.documentType}</span>
                </div>
                <div className="mono">
                  {formatDate(doc.documentDate)} / {formatInrPaise(doc.amountPaise)}
                </div>
              </div>
            ))
          ) : (
            <p className="source-head">
              No linked source document is present for this node yet.
            </p>
          )}
        </section>

        <section className="doc-panel">
          <h3>Uploaded Documents</h3>
          {linkedUploads.length > 0 ? (
            linkedUploads.map((upload) => (
              <div className="doc-row" key={upload.id}>
                <div>
                  <strong>{upload.name}</strong>
                  <span>{upload.type}</span>
                </div>
                <div className="mono">{formatBytes(upload.size)}</div>
              </div>
            ))
          ) : (
            <p className="source-head">
              No uploaded document is linked to this node in this browser
              session.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function amountPaiseFromData(data: CanonicalJsonValue): number | null {
  if (!isCanonicalRecord(data)) {
    return null;
  }

  const amount = data["amountPaise"];
  return typeof amount === "number" ? amount : null;
}

function buildAskContext(data: WorkspaceData) {
  return {
    controls: CONTROL_META.map((control) => ({
      id: control.id,
      title: control.title,
      assertion: control.assertion,
      populationLabel: control.populationLabel
    })),
    parties: data.dataset.parties.map((party) => party.name),
    voucherKinds: Array.from(
      new Set(data.dataset.vouchers.map((voucher) => voucher.voucherKind))
    ).sort(),
    financialYear: data.dataset.engagement.financialYear,
    supportedPredicates: [
      "duplicate-payment-pairs",
      "payments-to-party",
      "round-sum-journals"
    ]
  };
}

function isCanonicalRecord(
  value: CanonicalJsonValue
): value is { readonly [key: string]: CanonicalJsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceTitle(data: WorkspaceData, ref: string): string {
  const voucher = data.dataset.vouchers.find((candidate) => candidate.id === ref);
  if (voucher) {
    return `${voucher.voucherNumber} / ${voucher.voucherKind}`;
  }
  const doc = data.dataset.sourceDocuments.find((candidate) => candidate.id === ref);
  if (doc) {
    return `${doc.documentNumber} / ${doc.documentType}`;
  }
  const event = data.dataset.editLogEvents.find((candidate) => candidate.id === ref);
  if (event) {
    return `${event.eventKind} / ${formatDate(event.occurredAt.slice(0, 10))}`;
  }
  return ref;
}

function relatedDocuments(data: WorkspaceData, ref: string) {
  const direct = data.dataset.sourceDocuments.find((doc) => doc.id === ref);
  if (direct) {
    return [direct];
  }

  const voucher = data.dataset.vouchers.find((candidate) => candidate.id === ref);
  if (voucher) {
    return data.dataset.sourceDocuments.filter(
      (doc) =>
        doc.id === voucher.documentRef ||
        doc.voucherGuids.includes(voucher.id)
    );
  }

  const event = data.dataset.editLogEvents.find((candidate) => candidate.id === ref);
  if (event?.voucherGuid) {
    return relatedDocuments(data, event.voucherGuid);
  }

  return [];
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  const kib = Math.round(size / 1024);
  if (kib < 1024) {
    return `${kib} KB`;
  }
  return `${Math.round(kib / 1024)} MB`;
}
