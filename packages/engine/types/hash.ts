import { canonicalizeJson } from "./canonical-json.js";
import type { CanonicalJsonValue, ContentHash } from "./primitives.js";

const SHA256_INITIAL_STATE: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19
] as const;

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;

export function hashCanonicalJson(value: CanonicalJsonValue): ContentHash {
  return sha256Hex(canonicalizeJson(value)) as ContentHash;
}

export function hashString(value: string): ContentHash {
  return sha256Hex(value) as ContentHash;
}

export function sha256Hex(value: string): string {
  return sha256Bytes(utf8Bytes(value));
}

function sha256Bytes(bytes: Uint8Array): string {
  const padded = padMessage(bytes);
  const words = new Uint32Array(64);
  let h0 = getInitialState(0);
  let h1 = getInitialState(1);
  let h2 = getInitialState(2);
  let h3 = getInitialState(3);
  let h4 = getInitialState(4);
  let h5 = getInitialState(5);
  let h6 = getInitialState(6);
  let h7 = getInitialState(7);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        ((padded[base] ?? 0) << 24) |
        ((padded[base + 1] ?? 0) << 16) |
        ((padded[base + 2] ?? 0) << 8) |
        (padded[base + 3] ?? 0);
    }

    for (let index = 16; index < 64; index += 1) {
      const wordMinus15 = getWord(words, index - 15);
      const wordMinus2 = getWord(words, index - 2);
      const s0 =
        rotateRight(wordMinus15, 7) ^
        rotateRight(wordMinus15, 18) ^
        (wordMinus15 >>> 3);
      const s1 =
        rotateRight(wordMinus2, 17) ^
        rotateRight(wordMinus2, 19) ^
        (wordMinus2 >>> 10);
      words[index] =
        (getWord(words, index - 16) + s0 + getWord(words, index - 7) + s1) >>>
        0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 =
        (h + sum1 + choice + getConstant(index) + getWord(words, index)) >>> 0;
      const sum0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

function padMessage(bytes: Uint8Array): Uint8Array {
  const lengthWithMarker = bytes.length + 1;
  const paddingLength = (64 - ((lengthWithMarker + 8) % 64)) % 64;
  const padded = new Uint8Array(lengthWithMarker + paddingLength + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 1 - index] = Number(
      (bitLength >> BigInt(index * 8)) & 0xffn
    );
  }

  return padded;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function getInitialState(index: number): number {
  const value = SHA256_INITIAL_STATE[index];
  if (value === undefined) {
    throw new Error(`SHA-256 initial state missing at index ${index}`);
  }

  return value;
}

function getConstant(index: number): number {
  const value = SHA256_K[index];
  if (value === undefined) {
    throw new Error(`SHA-256 constant missing at index ${index}`);
  }

  return value;
}

function getWord(words: Uint32Array, index: number): number {
  const value = words[index];
  if (value === undefined) {
    throw new Error(`SHA-256 word missing at index ${index}`);
  }

  return value;
}

function utf8Bytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      continue;
    }

    if (codePoint > 0xffff) {
      index += 1;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }

  return Uint8Array.from(bytes);
}
