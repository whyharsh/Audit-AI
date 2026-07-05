import { describe, expect, test } from "bun:test";
import {
  canonicalizeJson,
  canonicalJsonInteger
} from "./canonical-json.js";
import { hashCanonicalJson, hashString } from "./hash.js";

describe("canonicalizeJson", () => {
  test("sorts object keys and emits no whitespace", () => {
    expect(
      canonicalizeJson({
        b: canonicalJsonInteger(2),
        a: canonicalJsonInteger(1)
      })
    ).toBe('{"a":1,"b":2}');
  });

  test("serializes nested arrays and objects deterministically", () => {
    expect(
      canonicalizeJson({
        z: [canonicalJsonInteger(3), { b: true, a: null }],
        a: "audit"
      })
    ).toBe('{"a":"audit","z":[3,{"a":null,"b":true}]}');
  });

  test("rejects undefined object fields", () => {
    expect(() => canonicalizeJson({ a: undefined })).toThrow(
      "Canonical JSON cannot contain undefined"
    );
  });

  test("rejects NaN and fractions", () => {
    expect(() => canonicalizeJson({ n: NaN })).toThrow(
      "Canonical JSON numbers must be safe integers"
    );
    expect(() => canonicalizeJson({ n: 1.25 })).toThrow(
      "Canonical JSON numbers must be safe integers"
    );
  });
});

describe("hashCanonicalJson", () => {
  test("hashes canonical serialization", () => {
    expect(hashString("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(
      hashCanonicalJson({
        b: canonicalJsonInteger(2),
        a: canonicalJsonInteger(1)
      })
    ).toBe(
      hashString('{"a":1,"b":2}')
    );
  });
});
