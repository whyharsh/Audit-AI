"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphModel, GraphNodeModel, NodeTone } from "./graphs";
import { CARD_H, CARD_W } from "./graphs";

const TONE_RULE: Record<NodeTone, string> = {
  structure: "#8C887C",
  exception: "#A23B2E",
  override: "#1C1B18",
  focus: "#1F4B6E",
  ghost: "transparent"
};

interface GraphSpaceProps {
  readonly model: GraphModel | null;
  readonly selectedId: string | null;
  readonly emptyMessage: string;
  readonly onSelect: (node: GraphNodeModel) => void;
  readonly onDescend: (node: GraphNodeModel) => void;
}

interface ViewState {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

export function GraphSpace({
  model,
  selectedId,
  emptyMessage,
  onSelect,
  onDescend
}: GraphSpaceProps) {
  const [view, setView] = useState<ViewState>({ x: 16, y: 16, k: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((v) => {
        const k = clamp(v.k * (event.deltaY < 0 ? 1.1 : 0.9), 0.4, 2.2);
        return { ...v, k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!model) {
    return (
      <div className="gp-canvas">
        <div className="gp-empty">{emptyMessage}</div>
      </div>
    );
  }

  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  return (
    <div className="gp-canvas">
      <svg
        ref={svgRef}
        onPointerDown={(e) => {
          drag.current = {
            startX: e.clientX,
            startY: e.clientY,
            viewX: view.x,
            viewY: view.y
          };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) {
            return;
          }
          const dx = e.clientX - drag.current.startX;
          const dy = e.clientY - drag.current.startY;
          setView((v) => ({
            ...v,
            x: (drag.current?.viewX ?? v.x) + dx,
            y: (drag.current?.viewY ?? v.y) + dy
          }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="gp-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0,0.8 L7.2,4 L0,7.2 z" fill="#8C887C" />
          </marker>
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          {model.edges.map((edge, i) => {
            const from = nodeById.get(edge.from);
            const to = nodeById.get(edge.to);
            if (!from || !to) {
              return null;
            }
            const x1 = from.x + CARD_W;
            const y1 = from.y + CARD_H / 2;
            const x2 = to.x;
            const y2 = to.y + CARD_H / 2;
            const midX = (x1 + x2) / 2;
            const d =
              y1 === y2
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} C${midX},${y1} ${midX},${y2} ${x2},${y2}`;
            return (
              <g key={`e${i}`}>
                <path
                  d={d}
                  fill="none"
                  stroke="#8C887C"
                  strokeWidth="1"
                  strokeDasharray={edge.dashed ? "3 3" : undefined}
                  markerEnd={edge.directed ? "url(#gp-arrow)" : undefined}
                />
                {edge.label ? (
                  <text
                    className="e-label"
                    x={midX}
                    y={Math.min(y1, y2) + Math.abs(y2 - y1) / 2 - 6}
                    textAnchor="middle"
                  >
                    {edge.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {model.nodes.map((node) => {
            const selected = node.id === selectedId;
            const ghost = node.tone === "ghost";
            return (
              <g
                key={node.id}
                style={{ cursor: "pointer" }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(node)}
                onDoubleClick={() => onDescend(node)}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={CARD_W}
                  height={CARD_H}
                  fill={ghost ? "var(--paper)" : "#FFFFFF"}
                  stroke={selected ? "#1F4B6E" : "#DAD6CA"}
                  strokeWidth={selected ? 1.5 : 1}
                  strokeDasharray={node.dashed ? "3 3" : undefined}
                />
                {node.tone !== "ghost" ? (
                  <rect
                    x={node.x}
                    y={node.y}
                    width={3}
                    height={CARD_H}
                    fill={TONE_RULE[node.tone]}
                  />
                ) : null}
                <text className="n-kind" x={node.x + 12} y={node.y + 15}>
                  {node.kindLine}
                  {node.statusSuffix ? (
                    <tspan className="n-kind-exc">{node.statusSuffix}</tspan>
                  ) : null}
                </text>
                <text
                  className="n-value"
                  x={node.x + 12}
                  y={node.y + 33}
                  fill={ghost ? "#6B675C" : "#1C1B18"}
                >
                  {node.value}
                </text>
                <text className="n-meta" x={node.x + 12} y={node.y + 49}>
                  {node.meta}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div style={{ position: "absolute", right: 10, top: 10, display: "flex", gap: 4 }}>
        <button
          className="btn quiet"
          type="button"
          onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 0.9, 0.4, 2.2) }))}
        >
          −
        </button>
        <button
          className="btn quiet"
          type="button"
          onClick={() => setView({ x: 16, y: 16, k: 1 })}
        >
          reset
        </button>
        <button
          className="btn quiet"
          type="button"
          onClick={() => setView((v) => ({ ...v, k: clamp(v.k * 1.1, 0.4, 2.2) }))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
