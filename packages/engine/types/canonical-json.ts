import type {
  CanonicalJson,
  CanonicalJsonInteger,
  CanonicalJsonValue
} from "./primitives.js";

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

export function canonicalJsonInteger(value: number): CanonicalJsonInteger {
  if (!Number.isSafeInteger(value)) {
    throw new CanonicalJsonError(
      `Canonical JSON numbers must be safe integers: ${String(value)}`
    );
  }

  return value as CanonicalJsonInteger;
}

export function toCanonicalJsonValue(value: unknown): CanonicalJsonValue {
  return normalizeCanonicalJsonValue(value, new WeakSet<object>());
}

export function canonicalizeJson(value: unknown): CanonicalJson {
  return serializeCanonicalJsonValue(toCanonicalJsonValue(value)) as CanonicalJson;
}

function normalizeCanonicalJsonValue(
  value: unknown,
  seen: WeakSet<object>
): CanonicalJsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return canonicalJsonInteger(value);
    case "undefined":
      throw new CanonicalJsonError("Canonical JSON cannot contain undefined");
    case "bigint":
      throw new CanonicalJsonError("Canonical JSON cannot contain bigint");
    case "symbol":
      throw new CanonicalJsonError("Canonical JSON cannot contain symbol");
    case "function":
      throw new CanonicalJsonError("Canonical JSON cannot contain function");
    case "object":
      return normalizeObjectOrArray(value, seen);
  }

  throw new CanonicalJsonError(`Unsupported canonical JSON value: ${String(value)}`);
}

function normalizeObjectOrArray(
  value: object,
  seen: WeakSet<object>
): CanonicalJsonValue {
  if (seen.has(value)) {
    throw new CanonicalJsonError("Canonical JSON cannot contain cycles");
  }

  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeCanonicalJsonValue(item, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError(
        "Canonical JSON objects must be plain objects"
      );
    }

    const output: Record<string, CanonicalJsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      output[key] = normalizeCanonicalJsonValue(item, seen);
    }

    return output;
  } finally {
    seen.delete(value);
  }
}

function serializeCanonicalJsonValue(value: CanonicalJsonValue): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return String(canonicalJsonInteger(value));
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalJsonValue).join(",")}]`;
  }

  const record = value as { readonly [key: string]: CanonicalJsonValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => {
      const item = record[key];
      if (item === undefined) {
        throw new CanonicalJsonError(
          `Canonical JSON object key has undefined value: ${key}`
        );
      }

      return `${JSON.stringify(key)}:${serializeCanonicalJsonValue(item)}`;
    })
    .join(",")}}`;
}
