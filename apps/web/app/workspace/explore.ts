import {
  canonicalizeJson,
  hashString,
  type SyntheticDataset,
  type SyntheticVoucher
} from "@audit-evidence/engine";

export interface CompiledQuestion {
  readonly question: string;
  readonly specJson: string;
  readonly specHash: string;
  readonly entityLabel: string;
  readonly populationSize: number;
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

/* The exploration contract per ARCHITECTURE.md 7b: the question compiles into
   a declarative spec shown to the user before execution, and a deterministic
   predicate executes it. No model is involved here yet; these are fixed
   recognizers. When LLM compilation arrives it must produce the same spec
   shape and the same display-before-execute step. */
export function compileQuestion(
  question: string,
  dataset: SyntheticDataset
): CompileResult {
  const q = question.trim().toLowerCase();
  if (q.length === 0) {
    return { ok: false, message: "Type a question first." };
  }

  if (q.includes("journal") && q.includes("round")) {
    const spec = {
      entity: "vouchers",
      predicate: "round-sum-journals",
      params: { roundToPaise: 1000000 }
    };
    return success(question, spec, "journal vouchers",
      dataset.vouchers.filter((v) => v.voucherKind === "journal").length,
      () =>
        dataset.vouchers
          .filter(
            (v) =>
              v.voucherKind === "journal" && v.totalAmountPaise % 1000000 === 0
          )
          .slice()
          .sort(byDateThenNumber)
    );
  }

  if (q.includes("duplicate") || q.includes("paid twice") || q.includes("twice")) {
    const spec = {
      entity: "vouchers",
      predicate: "duplicate-payment-pairs",
      params: { keys: ["partyGuid", "documentRef", "totalAmountPaise"] }
    };
    return success(question, spec, "payment vouchers",
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
      }
    );
  }

  const paymentsTo = /payments? to (.+)$/.exec(q);
  if (paymentsTo && paymentsTo[1]) {
    const name = paymentsTo[1].trim();
    const spec = {
      entity: "vouchers",
      predicate: "payments-to-party",
      params: { partyNameContains: name }
    };
    return success(question, spec, "payment vouchers",
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
      }
    );
  }

  return {
    ok: false,
    message:
      "This question cannot be compiled yet. Recognized forms: duplicate payments, round sum journals, payments to a party name."
  };
}

function success(
  question: string,
  spec: unknown,
  entityLabel: string,
  populationSize: number,
  run: () => readonly SyntheticVoucher[]
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
      run
    }
  };
}

function byDateThenNumber(a: SyntheticVoucher, b: SyntheticVoucher): number {
  return (
    a.voucherDate.localeCompare(b.voucherDate) ||
    a.voucherNumber.localeCompare(b.voucherNumber)
  );
}
