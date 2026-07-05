import {
  canonicalizeJson,
  canonicalJsonInteger,
  hashString,
  type CanonicalJsonValue,
  type SyntheticDataset,
  type SyntheticVoucher
} from "@audit-evidence/engine";

export interface CompiledQuestion {
  readonly question: string;
  readonly specJson: string;
  readonly specHash: string;
  readonly entityLabel: string;
  readonly populationSize: number;
  readonly compiledBy: "local" | "model";
  readonly model?: string;
  readonly modelReason?: string;
  readonly confidence?: number;
  readonly run: () => readonly SyntheticVoucher[];
}

export interface CompileFailure {
  readonly ok: false;
  readonly message: string;
}

export interface CompileSuccess {
  readonly ok: true;
  readonly compiled: CompiledQuestion;
}

export type CompileResult = CompileSuccess | CompileFailure;

export type QuestionPredicate =
  | "duplicate-payment-pairs"
  | "payments-to-party"
  | "round-sum-journals";

export interface QuestionSpec {
  readonly entity: "vouchers";
  readonly predicate: QuestionPredicate;
  readonly params: Readonly<Record<string, CanonicalJsonValue>>;
}

export interface CompileSpecOptions {
  readonly compiledBy?: "local" | "model";
  readonly model?: string;
  readonly modelReason?: string;
  readonly confidence?: number;
}

/* The exploration contract per ARCHITECTURE.md 7b: the question compiles into
   a declarative spec shown to the user before execution, and a deterministic
   predicate executes it. Model compilation must produce the same spec shape
   and the same display-before-execute step. */
export function compileQuestion(
  question: string,
  dataset: SyntheticDataset
): CompileResult {
  const q = question.trim().toLowerCase();
  if (q.length === 0) {
    return { ok: false, message: "Type a question first." };
  }

  if (q.includes("journal") && q.includes("round")) {
    return compileQuestionSpec(
      question,
      {
        entity: "vouchers",
        predicate: "round-sum-journals",
        params: { roundToPaise: canonicalJsonInteger(1000000) }
      },
      dataset
    );
  }

  if (q.includes("duplicate") || q.includes("paid twice") || q.includes("twice")) {
    return compileQuestionSpec(
      question,
      {
        entity: "vouchers",
        predicate: "duplicate-payment-pairs",
        params: { keys: ["partyGuid", "documentRef", "totalAmountPaise"] }
      },
      dataset
    );
  }

  const paymentsTo = /payments? to (.+)$/.exec(q);
  if (paymentsTo && paymentsTo[1]) {
    const name = paymentsTo[1].trim();
    return compileQuestionSpec(
      question,
      {
        entity: "vouchers",
        predicate: "payments-to-party",
        params: { partyNameContains: name }
      },
      dataset
    );
  }

  return {
    ok: false,
    message:
      "This question cannot be compiled yet. Recognized forms: duplicate payments, round sum journals, payments to a party name."
  };
}

export function compileQuestionSpec(
  question: string,
  spec: QuestionSpec,
  dataset: SyntheticDataset,
  options: CompileSpecOptions = {}
): CompileResult {
  if (spec.entity !== "vouchers") {
    return {
      ok: false,
      message: "Only voucher questions are supported in this MVP."
    };
  }

  switch (spec.predicate) {
    case "round-sum-journals": {
      const roundToPaise = numberParam(spec, "roundToPaise", 1000000);
      if (!Number.isSafeInteger(roundToPaise) || roundToPaise <= 0) {
        return {
          ok: false,
          message: "Round-sum queries need a positive integer paise unit."
        };
      }
      const normalized: QuestionSpec = {
        entity: "vouchers",
        predicate: "round-sum-journals",
        params: { roundToPaise: canonicalJsonInteger(roundToPaise) }
      };
      return success(
        question,
        normalized,
        "journal vouchers",
        dataset.vouchers.filter((v) => v.voucherKind === "journal").length,
        () =>
          dataset.vouchers
            .filter(
              (v) =>
                v.voucherKind === "journal" &&
                v.totalAmountPaise % roundToPaise === 0
            )
            .slice()
            .sort(byDateThenNumber),
        options
      );
    }

    case "duplicate-payment-pairs": {
      const normalized: QuestionSpec = {
        entity: "vouchers",
        predicate: "duplicate-payment-pairs",
        params: { keys: ["partyGuid", "documentRef", "totalAmountPaise"] }
      };
      return success(
        question,
        normalized,
        "payment vouchers",
        dataset.vouchers.filter((v) => v.voucherKind === "payment").length,
        () => {
          const groups = new Map<string, SyntheticVoucher[]>();
          for (const v of dataset.vouchers) {
            if (v.voucherKind !== "payment" || v.partyGuid === undefined) {
              continue;
            }
            const key = `${v.partyGuid}|${v.documentRef ?? ""}|${v.totalAmountPaise}`;
            const list = groups.get(key) ?? [];
            list.push(v);
            groups.set(key, list);
          }
          return [...groups.values()]
            .filter((list) => list.length > 1)
            .flat()
            .sort(byDateThenNumber);
        },
        options
      );
    }

    case "payments-to-party": {
      const name = stringParam(spec, "partyNameContains").trim().toLowerCase();
      if (name.length === 0) {
        return {
          ok: false,
          message: "Payment party questions need a party name."
        };
      }
      const normalized: QuestionSpec = {
        entity: "vouchers",
        predicate: "payments-to-party",
        params: { partyNameContains: name }
      };
      return success(
        question,
        normalized,
        "payment vouchers",
        dataset.vouchers.filter((v) => v.voucherKind === "payment").length,
        () => {
          const partyIds = new Set(
            dataset.parties
              .filter((p) => p.name.toLowerCase().includes(name))
              .flatMap((p) => [p.id, p.ledgerGuid])
          );
          return dataset.vouchers
            .filter(
              (v) =>
                v.voucherKind === "payment" &&
                v.partyGuid !== undefined &&
                partyIds.has(v.partyGuid)
            )
            .slice()
            .sort(byDateThenNumber);
        },
        options
      );
    }

    default:
      return {
        ok: false,
        message:
          "The model returned a predicate this workspace cannot execute yet."
      };
  }
}

function success(
  question: string,
  spec: QuestionSpec,
  entityLabel: string,
  populationSize: number,
  run: () => readonly SyntheticVoucher[],
  options: CompileSpecOptions = {}
): CompileSuccess {
  const specJson = canonicalizeJson(spec);
  return {
    ok: true,
    compiled: {
      question,
      specJson,
      specHash: hashString(specJson),
      entityLabel,
      populationSize,
      compiledBy: options.compiledBy ?? "local",
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.modelReason !== undefined
        ? { modelReason: options.modelReason }
        : {}),
      ...(options.confidence !== undefined
        ? { confidence: options.confidence }
        : {}),
      run
    }
  };
}

function numberParam(
  spec: QuestionSpec,
  key: string,
  fallback: number
): number {
  const value = spec.params[key];
  return typeof value === "number" ? value : fallback;
}

function stringParam(spec: QuestionSpec, key: string): string {
  const value = spec.params[key];
  return typeof value === "string" ? value : "";
}

function byDateThenNumber(a: SyntheticVoucher, b: SyntheticVoucher): number {
  return (
    a.voucherDate.localeCompare(b.voucherDate) ||
    a.voucherNumber.localeCompare(b.voucherNumber)
  );
}
