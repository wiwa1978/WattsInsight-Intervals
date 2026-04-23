"use client";

import { env } from "@/env";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown> | undefined;

const endpoint = `${normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL)}/logs/client`;
const rawConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
let consoleBridgeInstalled = false;

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toSerializable(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: toSerializable(value.cause),
    };
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(value.entries());
  }

  if (typeof Request !== "undefined" && value instanceof Request) {
    return {
      method: value.method,
      url: value.url,
      credentials: value.credentials,
      headers: toSerializable(value.headers),
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
      headers: toSerializable(value.headers),
    };
  }

  if (Array.isArray(value)) {
    return value.map(toSerializable);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const key of Object.getOwnPropertyNames(record)) {
      output[key] = toSerializable(record[key]);
    }

    return output;
  }

  return String(value);
}

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
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    return;
  }

  fetch(endpoint, {
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

function sendLogOnly(level: LogLevel, message: string, context?: LogContext) {
  sendLog(level, message, context);
}

export function installConsoleLogBridge() {
  if (consoleBridgeInstalled || typeof window === "undefined") {
    return;
  }

  const wrap = (level: LogLevel, base: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      base(...args);
      const [message, ...rest] = args;
      const normalizedMessage = typeof message === "string" ? message : "[client-log]";
      const context = rest.length > 0 ? { args: toSerializable(rest) } : undefined;
      sendLogOnly(level, normalizedMessage, context);
    };
  };

  console.debug = wrap("debug", rawConsole.debug);
  console.info = wrap("info", rawConsole.info);
  console.warn = wrap("warn", rawConsole.warn);
  console.error = wrap("error", rawConsole.error);

  consoleBridgeInstalled = true;
}

function consoleLog(level: LogLevel, message: string, context?: LogContext) {
  const method = level === "error" ? rawConsole.error : level === "warn" ? rawConsole.warn : level === "info" ? rawConsole.info : rawConsole.debug;
  method(message, context ?? {});
}

export const clientLogger = {
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
};
