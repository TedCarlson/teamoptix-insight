import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyMigrationAlignment,
  parseMigrationListOutput,
} from "./check-supabase-migration-alignment.mjs";

test("parses JSON after Supabase connection messages", () => {
  const migrations = parseMigrationListOutput(
    'Initialising login role...\n{"migrations":[{"local":"1","remote":"1"}]}\nConnecting to remote database...'
  );
  assert.deepEqual(migrations, [{ local: "1", remote: "1" }]);
});

test("classifies pending and database-only versions", () => {
  assert.deepEqual(
    classifyMigrationAlignment([
      { local: "1", remote: "1" },
      { local: "2", remote: "" },
      { local: "", remote: "3" },
    ]),
    {
      pendingRemote: [{ local: "2", remote: "" }],
      databaseOnly: [{ local: "", remote: "3" }],
    }
  );
});
