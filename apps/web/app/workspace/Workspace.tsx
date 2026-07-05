"use client";

import { useMemo, useState } from "react";
import { runV0Controls } from "@audit-evidence/engine";
import type { CanonicalJsonValue } from "@audit-evidence/engine/types";
import type { GraphModel, GraphNodeModel } from "./graphs";
import {
  buildExplorationModel,
  buildNeighborhoodModel,
  buildTrailModel
} from "./graphs";
import type { CompiledQuestion, QuestionSpec } from "./explore";
import { compileQuestion, compileQuestionSpec } from "./explore";
import { GraphSpace } from "./GraphSpace";
import type { OverrideRecord, WorkspaceData } from "./types";
import { CONTROL_META } from "./types";
import {
  formatDate,
  formatInrPaise,
  materialityPercent,
  shortHash
} from "./format";

type Layer = "trail" | "graph" | "source";

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
  const [layer, setLayer] = useState<Layer>("trail");
  const [focusRef, setFocusRef] = useState<string | null>(null);
  const [sourceRef, setSourceRef] = useState<string | null>(null);
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

  const trailModel: GraphModel | null = useMemo(() => {
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
    if (selectedFinding) {
      return buildTrailModel(
        selectedFinding,
        dataset,
        overrides[selectedFinding.id]
      );
    }
    return null;
  }, [selection, exploration, selectedFinding, dataset, overrides]);

  const neighborhoodModel: GraphModel | null = useMemo(() => {
    if (!focusRef) {
      return null;
    }
    const siblings =
      selection.type === "exploration" && exploration
        ? exploration.matches.map((v) => v.id)
        : selectedFinding
          ? selectedFinding.sourceRefs
          : [];
    return buildNeighborhoodModel(focusRef, dataset, siblings);
  }, [focusRef, dataset, selection, exploration, selectedFinding]);

  const activeModel = layer === "trail" ? trailModel : neighborhoodModel;
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
    setSelectedNodeId("t:finding");
    setLayer("trail");
    setFocusRef(null);
    setSourceRef(null);
    setReplayNote(null);
    setReason("");
    setMateriality("");
  }

  function descend(node: GraphNodeModel) {
    setSelectedNodeId(node.id);
    if (layer === "trail" && node.sourceRef) {
      setFocusRef(node.sourceRef);
      setSelectedNodeId(`n:${node.sourceRef}`);
      setLayer("graph");
      return;
    }
    if (layer === "graph" && node.sourceRef && data.snippets[node.sourceRef]) {
      setSourceRef(node.sourceRef);
      setLayer("source");
    }
  }

  function ascend() {
    if (layer === "source") {
      setLayer(focusRef ? "graph" : "trail");
      return;
    }
    if (layer === "graph") {
      setLayer("trail");
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
    setLayer("trail");
    setFocusRef(null);
    setSourceRef(null);
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
                  }
                }}
              >
                <span className="rule-title">{meta.title}</span>
                <span className="rule-meta">
                  <span className="mono">{meta.id} · v0 · {meta.assertion}</span>
                  <span className={`rule-count${list.length === 0 ? " zero" : ""}`}>
                    {list.length === 0
                      ? "no exceptions"
                      : `${list.length} exception${list.length > 1 ? "s" : ""}`}
                  </span>
                </span>
              </button>
            );
          })}

          <h2>Findings · {activeControlId}</h2>
          {(findingsByControl.get(activeControlId) ?? []).length === 0 ? (
            <p className="rail-meta">
              Population tested, nothing to report.
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
                  className={layer === "trail" ? "here" : ""}
                  onClick={() => setLayer("trail")}
                >
                  Trail
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={layer === "graph" ? "here" : ""}
                  disabled={!focusRef}
                  onClick={() => setLayer("graph")}
                >
                  Graph
                </button>
                <span>·</span>
                <button
                  type="button"
                  className={layer === "source" ? "here" : ""}
                  disabled={!sourceRef}
                  onClick={() => setLayer("source")}
                >
                  Source
                </button>
              </div>
              <button
                className="btn quiet"
                type="button"
                disabled={layer === "trail"}
                onClick={ascend}
              >
                Ascend
              </button>
              <button
                className="btn quiet"
                type="button"
                disabled={!selectedNode?.sourceRef || layer === "source"}
                onClick={() => {
                  if (selectedNode) {
                    descend(selectedNode);
                  }
                }}
              >
                Descend
              </button>
              <span className="gp-spacer" />
              <span className="gp-hint">
                click selects · double click descends · drag pans · scroll zooms
              </span>
              <button className="btn quiet" type="button" onClick={() => setCollapsed(true)}>
                Collapse
              </button>
            </div>

            {layer === "source" ? (
              <div className="source-view">
                {snippet ? (
                  <>
                    <p className="source-head">
                      <span className="name">{snippet.artifactName}</span>{" "}
                      · line {snippet.lineNumber} · fixture artifact in custody
                    </p>
                    <pre>{snippet.snippet}</pre>
                  </>
                ) : (
                  <p className="source-head">
                    No source snippet is available for this reference.
                  </p>
                )}
              </div>
            ) : (
              <GraphSpace
                model={activeModel}
                selectedId={selectedNodeId}
                emptyMessage={
                  layer === "trail"
                    ? "Choose a rule or a finding to draw its EvidenceTrail."
                    : "Select a FACT_REF in the trail and descend to see its neighborhood."
                }
                onSelect={(node) => setSelectedNodeId(node.id)}
                onDescend={descend}
              />
            )}
          </section>
        )}
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
