import { describe, expect, test } from "bun:test";
import {
  canonicalizeJson,
  canonicalJsonInteger
} from "./canonical-json.js";
import { hashCanonicalJson, hashString } from "./hash.js";

describe("canonicalizeJson", () => {
  test("sorts object keys and emits no whitespace", () => {
    const canonical: string = canonicalizeJson({
      b: canonicalJsonInteger(2),
      a: canonicalJsonInteger(1)
    });

    expect(canonical).toBe('{"a":1,"b":2}');
  });

  test("serializes nested arrays and objects deterministically", () => {
    const canonical: string = canonicalizeJson({
      z: [canonicalJsonInteger(3), { b: true, a: null }],
      a: "audit"
    });

    expect(canonical).toBe('{"a":"audit","z":[3,{"a":null,"b":true}]}');
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
    const abcHash: string = hashString("abc");
    const structuredHash: string = hashCanonicalJson({
      b: canonicalJsonInteger(2),
      a: canonicalJsonInteger(1)
    });
    const directHash: string = hashString('{"a":1,"b":2}');

    expect(abcHash).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(structuredHash).toBe(directHash);
  });

  test("hashes ill-formed strings with standard UTF-8 replacement", () => {
    const highSurrogateHash: string = hashString("\uD800");
    const lowSurrogateHash: string = hashString("\uDC00");

    expect(highSurrogateHash).toBe(
      "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097"
    );
    expect(lowSurrogateHash).toBe(
      "83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097"
    );
  });
});
