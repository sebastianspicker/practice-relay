/** MvEI schema-site local entrypoint. Why: implementers need a reproducible loopback reference URL. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../../../../scripts/static-server.mjs";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(sourceDir, "../../../..");
await startStaticServer({
  root: join(sourceDir, ".."),
  port: process.env.MVEI_SCHEMA_SITE_PORT ?? 5174,
  label: "MvEI schema site",
  mounts: [
    {
      urlPrefix: "/packages/movement-encode/fixtures/corpus/",
      root: join(repositoryRoot, "packages/movement-encode/fixtures/corpus"),
    },
  ],
});
