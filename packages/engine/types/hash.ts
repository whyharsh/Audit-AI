import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { canonicalizeJson } from "./canonical-json.js";
import type { CanonicalJsonValue, ContentHash } from "./primitives.js";

export function hashCanonicalJson(value: CanonicalJsonValue): ContentHash {
  return sha256Hex(canonicalizeJson(value)) as ContentHash;
}

export function hashString(value: string): ContentHash {
  return sha256Hex(value) as ContentHash;
}

export function sha256Hex(value: string): string {
  return bytesToHex(sha256(utf8ToBytes(value)));
}
