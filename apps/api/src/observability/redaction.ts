const REDACTED = "[redacted]";
const MAX_REDACTION_DEPTH = 5;
const MAX_REDACTION_ARRAY_LENGTH = 25;
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
