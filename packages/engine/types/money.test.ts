import { describe, expect, test } from "bun:test";
import { moneyPaise, parseTallyAmountToPaise } from "./money.js";

describe("moneyPaise", () => {
  test("accepts safe integer paise", () => {
    const amount: number = moneyPaise(1234);

    expect(amount).toBe(1234);
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
  test("parses decimal strings exactly", () => {
    const amountWithComma: number = parseTallyAmountToPaise("1,234.50");
    const negativeAmount: number = parseTallyAmountToPaise("-10.05");
    const wholeAmount: number = parseTallyAmountToPaise("42");

    expect(amountWithComma).toBe(123450);
    expect(negativeAmount).toBe(-1005);
    expect(wholeAmount).toBe(4200);
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
