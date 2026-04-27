import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tmpDirs: string[] = [];

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("logger.readLogEntries", () => {
  it("reads bounded bytes from the end of the log file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "2026-04-27.jsonl");
    const lines = Array.from({ length: 1000 }, (_, index) => JSON.stringify({ message: `line-${index}` })).join("\n") + "\n";
    fs.writeFileSync(file, lines, "utf8");
    const readFileSpy = vi.spyOn(fs, "readFileSync");

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    const result = logger.readLogEntries({ stream: "app", file: "2026-04-27.jsonl", limit: 5 });

    expect(result.entries).toHaveLength(5);
    expect(result.entries[0]?.message).toBe("line-999");
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});

describe("logger metadata serialization", () => {
  it("tolerates circular deep unusual metadata while redacting and bounding output", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    const metadata: Record<string, unknown> = {
      token: "secret-token",
      bigint: 123n,
      symbol: Symbol("secret-symbol"),
      fn: () => "secret",
      longValue: "x".repeat(10_000),
      deep: { level1: { level2: { level3: { level4: { level5: "too-deep" } } } } },
    };
    metadata.self = metadata;

    expect(() => logger.warn(metadata, "metadata test")).not.toThrow();

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("[redacted]");
    expect(output).toContain("[circular]");
    expect(output).toContain("[max-depth]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("too-deep");
    expect(output.length).toBeLessThan(3000);
  });
});
