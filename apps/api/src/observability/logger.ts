import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../env";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogStream = "app" | "audit";

type LogMetadata = Record<string, unknown>;

type ReadLogEntriesInput = {
  stream?: LogStream;
  file?: string;
  limit?: number;
};

const fileNamePattern = /^\d{4}-\d{2}-\d{2}(?:\.audit)?\.jsonl$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serialize(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: serialize(value.cause),
    };
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  }

  return String(value);
}

function normalizeArgs(arg1?: unknown, arg2?: unknown) {
  if (typeof arg1 === "string") {
    return {
      message: arg1,
      metadata: isRecord(arg2) ? arg2 : arg2 === undefined ? {} : { value: serialize(arg2) },
    };
  }

  if (isRecord(arg1)) {
    return {
      message: typeof arg2 === "string" ? arg2 : "log",
      metadata: serialize(arg1) as LogMetadata,
    };
  }

  return {
    message: typeof arg2 === "string" ? arg2 : "log",
    metadata: arg1 === undefined ? {} : { value: serialize(arg1) },
  };
}

function resolveLogDirectory() {
  if (!env.LOG_FILE_PATH) {
    return path.resolve(process.cwd(), "runtime-logs");
  }

  const resolved = path.resolve(env.LOG_FILE_PATH);
  return path.extname(resolved) ? path.dirname(resolved) : resolved;
}

const logDirectory = resolveLogDirectory();

function getLogFileName(stream: LogStream, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return stream === "audit" ? `${day}.audit.jsonl` : `${day}.jsonl`;
}

function getLogFilePath(stream: LogStream, date = new Date()) {
  return path.join(logDirectory, getLogFileName(stream, date));
}

function writeEntry(stream: LogStream, level: LogLevel, arg1?: unknown, arg2?: unknown) {
  const { message, metadata } = normalizeArgs(arg1, arg2);
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    stream,
    level,
    service: "api",
    environment: env.NODE_ENV,
    ...metadata,
    message,
  };

  const line = `${JSON.stringify(entry)}\n`;

  fs.mkdirSync(logDirectory, { recursive: true });
  fs.appendFileSync(getLogFilePath(stream), line, "utf8");

  if (level === "error") {
    console.error(line.trim());
  } else if (level === "warn") {
    console.warn(line.trim());
  } else if (level === "debug") {
    console.debug(line.trim());
  } else {
    console.info(line.trim());
  }
}

function getExpectedPatternForStream(stream: LogStream) {
  return stream === "audit" ? /^\d{4}-\d{2}-\d{2}\.audit\.jsonl$/ : /^\d{4}-\d{2}-\d{2}\.jsonl$/;
}

function listLogFiles(stream: LogStream) {
  if (!fs.existsSync(logDirectory)) {
    return {
      files: [] as string[],
      selectedFile: null,
    };
  }

  const pattern = getExpectedPatternForStream(stream);
  const files = fs
    .readdirSync(logDirectory)
    .filter((file) => fileNamePattern.test(file) && pattern.test(file))
    .sort((a, b) => b.localeCompare(a));

  return {
    files,
    selectedFile: files[0] ?? null,
  };
}

function readLogEntries(input: ReadLogEntriesInput) {
  const stream = input.stream ?? "app";
  const available = listLogFiles(stream);
  const selectedFile = input.file ?? available.selectedFile;

  if (!selectedFile) {
    return {
      file: null,
      entries: [] as Array<Record<string, unknown>>,
    };
  }

  if (!fileNamePattern.test(selectedFile) || !getExpectedPatternForStream(stream).test(selectedFile)) {
    throw new Error("Invalid log file");
  }

  const filePath = path.join(logDirectory, selectedFile);
  if (!fs.existsSync(filePath)) {
    return {
      file: selectedFile,
      entries: [] as Array<Record<string, unknown>>,
    };
  }

  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const raw = fs.readFileSync(filePath, "utf8");
  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(-limit)
    .reverse();

  return {
    file: selectedFile,
    entries,
  };
}

export const logger = {
  debug(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "debug", arg1, arg2);
  },
  info(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "info", arg1, arg2);
  },
  warn(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "warn", arg1, arg2);
  },
  error(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "error", arg1, arg2);
  },
  audit(arg1?: unknown, arg2?: unknown) {
    writeEntry("audit", "info", arg1, arg2);
  },
  listLogFiles,
  readLogEntries,
};
