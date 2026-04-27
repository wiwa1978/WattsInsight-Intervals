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
