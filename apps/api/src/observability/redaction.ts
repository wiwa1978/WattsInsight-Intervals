const REDACTED = "[redacted]";
const MAX_REDACTION_DEPTH = 5;
const MAX_REDACTION_ARRAY_LENGTH = 25;
const MAX_SAFE_CONTEXT_DEPTH = 4;
const MAX_SAFE_CONTEXT_ARRAY_LENGTH = 8;
const MAX_SAFE_CONTEXT_KEYS = 8;
const MAX_SAFE_CONTEXT_STRING_LENGTH = 128;
const SENSITIVE_KEY_PATTERN = /(?:password|passcode|secret|token|authorization|cookie|api[-_]?key|session|credential|signature)/i;
const URL_SECRET_PARAM_PATTERN = /([?&][^=]*(?:token|secret|code|key|signature|session)[^=]*=)[^&#]*/gi;
const KEY_VALUE_SECRET_PATTERN = /\b(?:password|passcode|secret|token|authorization|cookie|api[-_]?key|session|credential|signature)=([^\s&#]+)/gi;
const BEARER_PATTERN = /\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactString(value: string) {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, REDACTED)
    .replace(KEY_VALUE_SECRET_PATTERN, (match) => `${match.slice(0, Math.max(0, match.indexOf("=") + 1))}${REDACTED}`)
    .replace(URL_SECRET_PARAM_PATTERN, `$1${REDACTED}`);
}

function truncateString(value: string, maxLength: number) {
  const suffix = "...[truncated]";
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}` : value;
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return "[max-depth]";
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      cause: redactLogValue(value.cause, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_REDACTION_ARRAY_LENGTH).map((entry) => redactLogValue(entry, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactLogValue(entry, depth + 1),
      ]),
    );
  }

  return redactString(String(value));
}

export function redactSafeContext(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return truncateString(redactString(value), MAX_SAFE_CONTEXT_STRING_LENGTH);
  }

  if (value == null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return truncateString(redactString(String(value)), MAX_SAFE_CONTEXT_STRING_LENGTH);
  }

  if (depth >= MAX_SAFE_CONTEXT_DEPTH) {
    return "[max-depth]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: truncateString(redactString(value.name), MAX_SAFE_CONTEXT_STRING_LENGTH),
      message: truncateString(redactString(value.message), MAX_SAFE_CONTEXT_STRING_LENGTH),
      stack: value.stack ? truncateString(redactString(value.stack), MAX_SAFE_CONTEXT_STRING_LENGTH) : undefined,
      cause: redactSafeContext(value.cause, depth + 1, seen),
    };
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SAFE_CONTEXT_ARRAY_LENGTH).map((entry) => redactSafeContext(entry, depth + 1, seen));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_SAFE_CONTEXT_KEYS)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSafeContext(entry, depth + 1, seen),
        ]),
    );
  }

  return truncateString(redactString(String(value)), MAX_SAFE_CONTEXT_STRING_LENGTH);
}
