"use client";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown> | undefined;

const sensitiveKeyPattern = /(authorization|cookie|email|password|secret|signature|token|code)/i;
const MAX_STRING_LENGTH = 500;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 20;
const MAX_SERIALIZE_DEPTH = 4;

function truncateString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitiveKeyPattern.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return truncateString(url.toString());
  } catch {
    return truncateString(value);
  }
}

export function toSerializable(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? redactUrl(value) : value;
  }

  if (depth >= MAX_SERIALIZE_DEPTH) {
    return "[TRUNCATED_DEPTH]";
  }

  if (value instanceof Error) {
    const errorWithCause = value as Error & { cause?: unknown };

    return {
      name: value.name,
      message: truncateString(value.message),
      stack: value.stack ? truncateString(value.stack) : undefined,
      cause: toSerializable(errorWithCause.cause, depth + 1),
    };
  }

  if (value instanceof URL) {
    return redactUrl(value.toString());
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(value.entries());
  }

  if (typeof Request !== "undefined" && value instanceof Request) {
    return {
      method: value.method,
      url: value.url,
      credentials: value.credentials,
      headers: toSerializable(value.headers, depth + 1),
    };
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return {
      status: value.status,
      statusText: value.statusText,
      ok: value.ok,
      redirected: value.redirected,
      type: value.type,
      url: value.url,
      headers: toSerializable(value.headers, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => toSerializable(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`[TRUNCATED ${value.length - MAX_ARRAY_ITEMS} items]`);
    }
    return items;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    const keys = Object.getOwnPropertyNames(record);

    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      output[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : toSerializable(record[key], depth + 1);
    }

    if (keys.length > MAX_OBJECT_KEYS) {
      output.__truncatedKeys = keys.length - MAX_OBJECT_KEYS;
    }

    return output;
  }

  return String(value);
}

export function createClientLogger(options: { endpoint: string }) {
  const rawConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  let consoleBridgeInstalled = false;

  function sendLog(level: LogLevel, message: string, context?: LogContext) {
    const payload = {
      level,
      message,
      context: toSerializable(context),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    };

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const body = JSON.stringify(payload);
      navigator.sendBeacon(options.endpoint, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
    });
  }

  function consoleLog(level: LogLevel, message: string, context?: LogContext) {
    const method =
      level === "error"
        ? rawConsole.error
        : level === "warn"
          ? rawConsole.warn
          : level === "info"
            ? rawConsole.info
            : rawConsole.debug;
    method(message, context ?? {});
  }

  return {
    installConsoleLogBridge() {
      if (consoleBridgeInstalled || typeof window === "undefined") {
        return;
      }

      const wrap = (level: LogLevel, base: (...args: unknown[]) => void) => {
        return (...args: unknown[]) => {
          base(...args);
          const [message, ...rest] = args;
          const normalizedMessage = typeof message === "string" ? message : "[client-log]";
          const context = rest.length > 0 ? { args: toSerializable(rest) } : undefined;
          sendLog(level, normalizedMessage, context);
        };
      };

      console.debug = wrap("debug", rawConsole.debug);
      console.info = wrap("info", rawConsole.info);
      console.warn = wrap("warn", rawConsole.warn);
      console.error = wrap("error", rawConsole.error);

      consoleBridgeInstalled = true;
    },
    logger: {
      debug(message: string, context?: LogContext) {
        consoleLog("debug", message, context);
        sendLog("debug", message, context);
      },
      info(message: string, context?: LogContext) {
        consoleLog("info", message, context);
        sendLog("info", message, context);
      },
      warn(message: string, context?: LogContext) {
        consoleLog("warn", message, context);
        sendLog("warn", message, context);
      },
      error(message: string, context?: LogContext) {
        consoleLog("error", message, context);
        sendLog("error", message, context);
      },
    },
  };
}
