#!/usr/bin/env node
const POLL_INTERVAL_MS = Number(process.env.ARTIFACT_INGEST_POLL_MS ?? 10000);
const INGEST_URL = process.env.ARTIFACT_INGEST_URL ?? "http://localhost:3000/api/cron/operations/artifact-ingest";
const LOG_PREFIX = "[artifact-ingest-poller]";
const RUN_ONCE = process.env.RUN_ONCE === "true" || process.argv.includes("--once");

function now() {
  return new Date().toISOString();
}

async function runPoll() {
  const start = Date.now();

  try {
    console.log(`${LOG_PREFIX} ${now()} polling ${INGEST_URL}`);
    const response = await fetch(INGEST_URL, { method: "GET" });
    const elapsed = Date.now() - start;

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`${LOG_PREFIX} ${now()} failed ${response.status} ${response.statusText} (${elapsed}ms)`);
      if (body) console.error(`${LOG_PREFIX} response body: ${body}`);
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      console.warn(`${LOG_PREFIX} ${now()} response JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
      data = null;
    }

    if (data && typeof data === "object") {
      const processedCount = typeof data.processed_count === "number" ? data.processed_count : null;
      const reconciledCount = typeof data.reconciled_count === "number" ? data.reconciled_count : null;
      const summary = processedCount !== null || reconciledCount !== null
        ? `processed=${processedCount ?? 0}, reconciled=${reconciledCount ?? 0}`
        : "ok";

      console.log(`${LOG_PREFIX} ${now()} success ${response.status} ${response.statusText} (${elapsed}ms) ${summary}`);
    } else {
      console.log(`${LOG_PREFIX} ${now()} success ${response.status} ${response.statusText} (${elapsed}ms)`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${LOG_PREFIX} ${now()} error ${message}`);
  }
}

async function main() {
  if (RUN_ONCE) {
    await runPoll();
    return;
  }

  while (true) {
    await runPoll();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} fatal error`, error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
