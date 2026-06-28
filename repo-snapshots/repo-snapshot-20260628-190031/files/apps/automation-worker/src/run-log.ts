import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOG_DIR = path.join(os.tmpdir(), "teamoptix-insight-worker", "logs");

export function makeRunLogger(runId?: string | null, prefix = "RUN") {
  const safeRunId = runId || `${Date.now()}`;
  const logPath = path.join(LOG_DIR, `${safeRunId}.log`);

  return {
    logPath,
    async log(message: string, meta?: unknown) {
      await mkdir(LOG_DIR, { recursive: true });
      const line = [
        new Date().toISOString(),
        `[${prefix}]`,
        message,
        meta === undefined ? "" : JSON.stringify(meta),
      ].filter(Boolean).join(" ");

      console.log(`[${prefix}] ${message}`, meta ?? "");
      await appendFile(logPath, `${line}\n`);
    },
  };
}
