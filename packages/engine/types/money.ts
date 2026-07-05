import type { MoneyPaise } from "./primitives.js";

export class MoneyPaiseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyPaiseError";
  }
}

export function moneyPaise(value: number): MoneyPaise {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyPaiseError(
      `MoneyPaise must be a safe integer: ${String(value)}`
    );
  }

  return value as MoneyPaise;
}

export function parseTallyAmountToPaise(value: string): MoneyPaise {
  const normalized = value.trim().replaceAll(",", "");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);

  if (match === null) {
    throw new MoneyPaiseError(`Invalid Tally amount: ${value}`);
  }

  const sign = match[1] ?? "";
  const rupeesText = match[2];
  const paiseText = match[3] ?? "";

  if (rupeesText === undefined) {
    throw new MoneyPaiseError(`Invalid Tally amount: ${value}`);
  }

  const paise =
    BigInt(rupeesText) * 100n + BigInt(paiseText.padEnd(2, "0"));
  const signedPaise = sign === "-" ? -paise : paise;
  const numericPaise = Number(signedPaise);

  if (
    !Number.isSafeInteger(numericPaise) ||
    BigInt(numericPaise) !== signedPaise
  ) {
    throw new MoneyPaiseError(`Tally amount exceeds safe integer range: ${value}`);
  }

  return moneyPaise(numericPaise);
}
