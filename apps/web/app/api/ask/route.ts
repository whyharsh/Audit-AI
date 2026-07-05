import { NextResponse } from "next/server";
import { canonicalJsonInteger } from "@audit-evidence/engine";
import type { QuestionPredicate, QuestionSpec } from "../../workspace/explore";

export const runtime = "nodejs";

const SUPPORTED_PREDICATES: readonly QuestionPredicate[] = [
  "duplicate-payment-pairs",
  "payments-to-party",
  "round-sum-journals"
];

const DEFAULT_MODEL = "gpt-4.1-mini";

interface AskBody {
  readonly question?: unknown;
  readonly context?: unknown;
}

interface ModelCompileResult {
  readonly predicate?: unknown;
  readonly params?: unknown;
  readonly reason?: unknown;
  readonly confidence?: unknown;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "OPENAI_API_KEY is not set. Add it to apps/web/.env.local and restart the dev server."
      },
      { status: 503 }
    );
  }

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Request body must be JSON." },
      { status: 400 }
    );
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length === 0) {
    return NextResponse.json(
      { ok: false, message: "Type a question first." },
      { status: 400 }
    );
  }

  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_output_tokens: 500,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemPrompt()
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                question,
                context: body.context ?? null
              })
            }
          ]
        }
      ]
    })
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: openAiErrorMessage(raw, response.status)
      },
      { status: 502 }
    );
  }

  const text = extractText(raw);
  const parsed = parseJsonObject(text);
  const normalized = normalizeModelResult(parsed);

  if (!normalized.ok) {
    return NextResponse.json(
      { ok: false, message: normalized.message },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    spec: normalized.spec,
    reason: normalized.reason,
    confidence: normalized.confidence,
    model
  });
}

function systemPrompt(): string {
  return [
    "You compile audit workspace questions into deterministic query specs.",
    "Return JSON only. Do not use markdown.",
    "Do not answer the audit question yourself.",
    "Do not create audit rules, legal claims, findings, or facts.",
    "Choose exactly one supported predicate when possible.",
    "Supported predicates:",
    "- duplicate-payment-pairs: duplicate outgoing payment vouchers using partyGuid, documentRef, and totalAmountPaise.",
    "- payments-to-party: outgoing payment vouchers whose party name contains params.partyNameContains.",
    "- round-sum-journals: journal vouchers whose amount is a multiple of params.roundToPaise.",
    "If unsupported, return {\"predicate\":\"unsupported\",\"reason\":\"...\",\"confidence\":0,\"params\":{}}.",
    "Otherwise return {\"predicate\":\"...\",\"params\":{...},\"reason\":\"...\",\"confidence\":0-100}.",
    "Use integer paise only for money. Default round-sum threshold is 1000000 paise."
  ].join("\n");
}

function normalizeModelResult(
  value: unknown
):
  | {
      readonly ok: true;
      readonly spec: QuestionSpec;
      readonly reason: string;
      readonly confidence: number;
    }
  | { readonly ok: false; readonly message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "The model did not return a JSON object." };
  }

  const result = value as ModelCompileResult;
  const predicate = typeof result.predicate === "string" ? result.predicate : "";
  const reason =
    typeof result.reason === "string" && result.reason.trim().length > 0
      ? result.reason.trim()
      : "Compiled by the model.";
  const confidence =
    typeof result.confidence === "number" &&
    Number.isFinite(result.confidence)
      ? Math.max(0, Math.min(100, Math.round(result.confidence)))
      : 0;

  if (predicate === "unsupported") {
    return { ok: false, message: reason };
  }

  if (!SUPPORTED_PREDICATES.includes(predicate as QuestionPredicate)) {
    return {
      ok: false,
      message: "The model returned a predicate this workspace cannot execute yet."
    };
  }

  const knownPredicate = predicate as QuestionPredicate;
  const params = isRecord(result.params) ? result.params : {};
  if (knownPredicate === "payments-to-party") {
    const name = params["partyNameContains"];
    if (typeof name !== "string" || name.trim().length === 0) {
      return {
        ok: false,
        message: "The model did not identify a party name for this question."
      };
    }
    return {
      ok: true,
      spec: {
        entity: "vouchers",
        predicate: knownPredicate,
        params: { partyNameContains: name.trim().toLowerCase() }
      },
      reason,
      confidence
    };
  }

  if (knownPredicate === "round-sum-journals") {
    const roundToPaise = params["roundToPaise"];
    const normalizedRoundToPaise =
      typeof roundToPaise === "number" &&
      Number.isSafeInteger(roundToPaise) &&
      roundToPaise > 0
        ? roundToPaise
        : 1000000;
    return {
      ok: true,
      spec: {
        entity: "vouchers",
        predicate: knownPredicate,
        params: {
          roundToPaise: canonicalJsonInteger(normalizedRoundToPaise)
        }
      },
      reason,
      confidence
    };
  }

  return {
    ok: true,
    spec: {
      entity: "vouchers",
      predicate: knownPredicate,
      params: { keys: ["partyGuid", "documentRef", "totalAmountPaise"] }
    },
    reason,
    confidence
  };
}

function extractText(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }

  if (typeof value["output_text"] === "string") {
    return value["output_text"];
  }

  const fragments: string[] = [];
  collectText(value, fragments);
  return fragments.join("\n");
}

function collectText(value: unknown, fragments: string[]): void {
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, fragments);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  if (typeof value["text"] === "string") {
    fragments.push(value["text"]);
  }
  if (typeof value["output_text"] === "string") {
    fragments.push(value["output_text"]);
  }

  for (const nested of Object.values(value)) {
    collectText(nested, fragments);
  }
}

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    return null;
  }

  try {
    return JSON.parse(trimmed.slice(first, last + 1));
  } catch {
    return null;
  }
}

function openAiErrorMessage(value: unknown, status: number): string {
  if (isRecord(value)) {
    const error = value["error"];
    if (isRecord(error) && typeof error["message"] === "string") {
      return error["message"];
    }
  }
  return `OpenAI request failed with status ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
