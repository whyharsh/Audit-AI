import { describe, expect, test } from "bun:test";
import { moneyPaise, parseTallyAmountToPaise } from "./money.js";

describe("moneyPaise", () => {
  test("accepts safe integer paise", () => {
    expect(moneyPaise(1234)).toBe(1234);
  });

  test("rejects fractions and unsafe integers", () => {
    expect(() => moneyPaise(1234.56)).toThrow(
      "MoneyPaise must be a safe integer"
    );
    expect(() => moneyPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "MoneyPaise must be a safe integer"
    );
  });
});

describe("parseTallyAmountToPaise", () => {
  test("parses decimal strings without parseFloat semantics", () => {
    expect(parseTallyAmountToPaise("1,234.50")).toBe(123450);
    expect(parseTallyAmountToPaise("-10.05")).toBe(-1005);
    expect(parseTallyAmountToPaise("42")).toBe(4200);
  });

  test("rejects malformed decimal strings", () => {
    expect(() => parseTallyAmountToPaise("12.345")).toThrow(
      "Invalid Tally amount"
    );
    expect(() => parseTallyAmountToPaise("12.3abc")).toThrow(
      "Invalid Tally amount"
    );
  });
});
