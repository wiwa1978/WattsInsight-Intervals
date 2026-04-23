const baseUrl = process.env.API_URL || "http://localhost:8787";

async function check(path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    path,
    status: response.status,
    ok: response.ok,
  };
}

async function main() {
  const checks = await Promise.all([
    check("/health"),
    check("/openapi.json"),
    check("/docs"),
  ]);

  let hasFailure = false;
  for (const result of checks) {
    if (!result.ok) {
      hasFailure = true;
      console.error(`[smoke] FAIL ${result.path} -> ${result.status}`);
    } else {
      console.log(`[smoke] OK   ${result.path} -> ${result.status}`);
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[smoke] fatal", error);
  process.exit(1);
});
