#!/usr/bin/env bash

set -euo pipefail

mkdir -p "apps/api/tests/.reports" "apps/web/tests/.reports" "apps/admin/tests/.reports" "reports"

echo "==> Running unit + functional tests"
bun run --cwd apps/api test -- --reporter=json --outputFile=tests/.reports/vitest.json
bun run --cwd apps/web test -- --reporter=json --outputFile=tests/.reports/vitest.json
bun run --cwd apps/admin test -- --reporter=json --outputFile=tests/.reports/vitest.json

echo "==> Running e2e tests"
bun run --cwd apps/web test:e2e -- --reporter=json > "apps/web/tests/.reports/playwright.json"
bun run --cwd apps/admin test:e2e -- --reporter=json > "apps/admin/tests/.reports/playwright.json"

echo "==> Running typechecks"
bun run typecheck:api
bun run typecheck:web
bun run typecheck:admin

echo "==> Generating markdown test report"
node "scripts/generate-test-report.mjs" "reports/test-report.md"

echo "==> All tests and checks passed"
