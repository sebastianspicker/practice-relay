/** Run the required service lane in a unique disposable Compose project. */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const project = `relay-check-${randomBytes(6).toString("hex")}`;
const environment = {
  ...process.env,
  RELAY_TEST_PASSWORD: randomBytes(24).toString("hex"),
  RELAY_TEST_S3_USER: randomBytes(12).toString("hex"),
  RELAY_TEST_S3_PASSWORD: randomBytes(24).toString("hex"),
};
const prefix = ["compose", "-p", project, "-f", "deploy/compose.integration.yml"];

function compose(args, capture = false) {
  const result = spawnSync("docker", [...prefix, ...args], { env: environment, encoding: "utf8", stdio: capture ? "pipe" : "inherit", timeout: 600_000 });
  if (result.error || result.status !== 0) throw new Error(`disposable integration service command failed: ${args[0]}`);
  return result.stdout?.trim();
}

try {
  compose(["up", "--build", "-d"]);
  const databasePort = compose(["port", "postgres", "5432"], true).split(":").at(-1);
  const s3Port = compose(["port", "s3", "9000"], true).split(":").at(-1);
  const result = spawnSync(process.execPath, ["--import", "tsx", "tests/integration/suite.ts"], {
    env: {
      ...environment,
      RELAY_TEST_DATABASE_URL: `postgresql://postgres:${environment.RELAY_TEST_PASSWORD}@127.0.0.1:${databasePort}/relay_integration`,
      RELAY_TEST_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
      RELAY_TEST_COMPOSE_PROJECT: project,
    },
    stdio: "inherit", timeout: 300_000,
  });
  if (result.error || result.status !== 0) throw new Error("multi-process integration or recovery checks failed");
} finally {
  compose(["down", "--volumes", "--remove-orphans"]);
}
