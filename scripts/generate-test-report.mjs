#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node scripts/generate-test-report.mjs <output-path>");
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function normalizeStatus(status) {
  if (!status) return "unknown";
  if (status === "expected" || status === "passed") return "passed";
  if (status === "skipped" || status === "pending") return "skipped";
  if (status === "failed" || status === "unexpected") return "failed";
  return status;
}

function collectVitestResults(appName, reportPath) {
  const report = readJson(reportPath);
  if (!report?.testResults) return [];

  const rows = [];
  for (const suite of report.testResults) {
    for (const assertion of suite.assertionResults || []) {
      rows.push({
        app: appName,
        title: assertion.fullName || assertion.title || "unknown test",
        status: normalizeStatus(assertion.status),
      });
    }
  }
  return rows;
}

function collectPlaywrightSpecs(suiteNode, appName, rows) {
  for (const spec of suiteNode.specs || []) {
    for (const test of spec.tests || []) {
      const result = test.results?.[test.results.length - 1];
      rows.push({
        app: appName,
        title: spec.title || "unknown e2e",
        status: normalizeStatus(result?.status || test.status),
      });
    }
  }

  for (const child of suiteNode.suites || []) {
    collectPlaywrightSpecs(child, appName, rows);
  }
}

function collectPlaywrightResults(appName, reportPath) {
  const report = readJson(reportPath);
  if (!report?.suites) return [];

  const rows = [];
  for (const suite of report.suites) {
    collectPlaywrightSpecs(suite, appName, rows);
  }
  return rows;
}

const root = process.cwd();
const rows = [
  ...collectVitestResults("api", path.join(root, "apps/api/tests/.reports/vitest.json")),
  ...collectVitestResults("web", path.join(root, "apps/web/tests/.reports/vitest.json")),
  ...collectVitestResults("admin", path.join(root, "apps/admin/tests/.reports/vitest.json")),
  ...collectPlaywrightResults("web", path.join(root, "apps/web/tests/.reports/playwright.json")),
  ...collectPlaywrightResults("admin", path.join(root, "apps/admin/tests/.reports/playwright.json")),
];

const passed = rows.filter((row) => row.status === "passed").length;
const failed = rows.filter((row) => row.status === "failed").length;
const skipped = rows.filter((row) => row.status === "skipped").length;

const lines = [];
lines.push(`# Test Report`);
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Total: ${rows.length}`);
lines.push(`Passed: ${passed}`);
lines.push(`Failed: ${failed}`);
lines.push(`Skipped: ${skipped}`);
lines.push("");
lines.push("## Results");
for (const row of rows) {
  const marker = row.status === "passed" ? "PASS" : row.status === "failed" ? "FAIL" : "SKIP";
  lines.push(`- [${marker}] ${row.app} :: ${row.title}`);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

console.log(`Test report generated: ${outputPath}`);
