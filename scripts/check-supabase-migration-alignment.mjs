#!/usr/bin/env node

import { spawnSync } from "node:child_process";

export function parseMigrationListOutput(output) {
  const jsonLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('{"migrations"'));
  if (!jsonLine) {
    throw new Error("Supabase CLI did not return a migration ledger as JSON.");
  }
  return JSON.parse(jsonLine).migrations;
}

export function classifyMigrationAlignment(migrations) {
  return {
    pendingRemote: migrations.filter(
      (migration) => migration.local && !migration.remote
    ),
    databaseOnly: migrations.filter(
      (migration) => !migration.local && migration.remote
    ),
  };
}

function formatVersions(entries, key) {
  return entries.map((entry) => entry[key]).join(", ");
}

function main() {
  const result = spawnSync(
    "supabase",
    ["migration", "list", "--linked", "--output-format", "json"],
    { encoding: "utf8" }
  );
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  if (result.error) {
    console.error(`Supabase migration alignment check failed: ${result.error.message}`);
    process.exit(2);
  }
  if (result.status !== 0) {
    console.error(combinedOutput.trim());
    process.exit(result.status ?? 2);
  }

  let migrations;
  try {
    migrations = parseMigrationListOutput(combinedOutput);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(combinedOutput.trim());
    process.exit(2);
  }

  const { pendingRemote, databaseOnly } = classifyMigrationAlignment(migrations);

  if (pendingRemote.length > 0) {
    console.error(
      `Blocked: repository migrations are not applied to linked Supabase: ${formatVersions(
        pendingRemote,
        "local"
      )}`
    );
  }
  if (databaseOnly.length > 0) {
    console.error(
      `Blocked: linked Supabase contains database-only migration records: ${formatVersions(
        databaseOnly,
        "remote"
      )}`
    );
  }
  if (pendingRemote.length > 0 || databaseOnly.length > 0) {
    console.error(
      "Resolve the ledger difference before publishing application code. Run `supabase migration list` to inspect it."
    );
    process.exit(1);
  }

  const lastApplied = migrations.filter((migration) => migration.remote).at(-1);
  console.log(
    `Supabase migration alignment passed through ${lastApplied?.remote ?? "an empty ledger"}.`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
