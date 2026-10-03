/** Explicit offline schema migration and validated JSON-to-PostgreSQL import. */
import { parseArgs } from "node:util";
import { createDatabase } from "@practice-relay/database";
import { importRecordSnapshot, migrateRecordStore } from "@practice-relay/record-store";
import { migrateRuntimeState } from "@practice-relay/runtime-state";
import { importMediaSnapshot, migrateMediaStore } from "@practice-relay/media-store";
import { readJsonRecordSnapshot } from "./json-record-snapshot.js";
import { readMediaInventory } from "./migration-media-inventory.js";

const { values } = parseArgs({ options: {
  schema: { type: "boolean" }, source: { type: "string" },
  "media-inventory": { type: "string" }, apply: { type: "boolean" },
  "writers-stopped": { type: "boolean" }, help: { type: "boolean" },
} });

if (values.help) {
  console.log("pnpm migrate:postgres --schema --apply | --source <tenant-snapshot> --media-inventory <inventory.json> [--apply --writers-stopped]");
} else {
  if (Boolean(values.schema) === Boolean(values.source)) throw new Error("choose exactly one of --schema or --source");
  if (values.apply && !values.schema && !values["writers-stopped"]) throw new Error("offline import requires --writers-stopped; stop all source and destination writers first");
  const database = createDatabase({ connectionString: process.env.PRACTICE_RELAY_DATABASE_URL ?? "" });
  try {
    if (values.schema) {
      if (!values.apply) throw new Error("schema changes require --schema --apply; source import defaults to a read-only dry run");
      await migrateRecordStore(database);
      await migrateRuntimeState(database);
      await migrateMediaStore(database);
      console.log(JSON.stringify({ schema: "applied", components: ["record-store", "runtime-state", "media-store"] }));
    } else {
      if (!values["media-inventory"]) throw new Error("--media-inventory is required, including an explicit version-1 empty inventory when there is no media");
      const snapshot = await readJsonRecordSnapshot(values.source!);
      const media = await readMediaInventory(values["media-inventory"], snapshot.records);
      const tenantId = process.env.PRACTICE_RELAY_TENANT_ID ?? "default";
      const dryRun = !values.apply;
      const result = await database.transaction(async (transaction) => {
        const records = await importRecordSnapshot(transaction, { ...snapshot, tenantId, dryRun });
        const inventory = await importMediaSnapshot(transaction, { tenantId, items: media, dryRun });
        return { ...records, media: inventory };
      });
      console.log(JSON.stringify({ ...result, sourceUntouched: true }));
    }
  } finally { await database.close(); }
}
