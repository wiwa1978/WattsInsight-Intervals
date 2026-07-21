const targets = [
  "http://127.0.0.1:8787/health",
  "http://127.0.0.1:8787/ready",
  "http://127.0.0.1:8787/openapi.json",
  "http://127.0.0.1:3100/",
  "http://127.0.0.1:3100/en",
  "http://127.0.0.1:3100/en/login",
  "http://127.0.0.1:3100/en/signup",
  "http://127.0.0.1:3101/",
  "http://127.0.0.1:3101/en",
  "http://127.0.0.1:3101/en/login",
];

const startupTargets = [
  "http://127.0.0.1:8787/health",
  "http://127.0.0.1:3100/",
  "http://127.0.0.1:3101/",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const startedAt = performance.now();
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    const durationMs = Math.round(performance.now() - startedAt);
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, durationMs };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForStartup() {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    const results = await Promise.allSettled(startupTargets.map((target) => fetchWithTimeout(target, 2_000)));
    if (results.every((result) => result.status === "fulfilled" && result.value.status !== 0)) {
      return;
    }

    await sleep(1_000);
  }

  throw new Error("Timed out waiting for dev servers");
}

async function main() {
  console.log("[prewarm] Waiting for dev servers...");
  await waitForStartup();

  console.log("[prewarm] Compiling common dev routes...");
  for (const target of targets) {
    try {
      const result = await fetchWithTimeout(target, 60_000);
      console.log(`[prewarm] ${target} -> ${result.status} (${result.durationMs}ms)`);
    } catch (error) {
      console.warn(`[prewarm] ${target} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log("[prewarm] Done");
}

main().catch((error) => {
  console.warn(`[prewarm] Skipped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 0;
});
