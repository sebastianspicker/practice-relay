/**
 * Structural maturity dimensions for Practice Relay and shared WorkRecord Core contracts.
 *
 * Kept declarative so source-level readiness evidence is distinct from the
 * functional gates that prevent structural files alone from implying outcomes.
 */
import {
  elevatedLevel,
  presentFiles,
} from "./maturity-dimension-helpers.mjs";

/** Require every domain capability marker claimed by the structural row. */
export function hasDomainSurface(source) {
  return [
    "assertCanMutate",
    "createEmptyRecord",
    "attachUsePolicySnapshot",
    "setPreferredTake",
  ].every((marker) => source.includes(marker));
}

/** Require the assignment, secret, signing, and JWKS surfaces claimed by LTI. */
export function hasLtiSurface(source) {
  return [
    "buildMultiAssetAssignmentPayload",
    "LTI_STATUS",
    "resolveLtiSecret",
    "signHs256Jwt",
    "signRs256Jwt",
    "exportPlatformJwks",
  ].every((marker) => source.includes(marker));
}

/** Require tenant recovery and object-media markers claimed by the ops row. */
export function hasOpsSurface(storeSource, mediaSource) {
  const storeReady = ["tenantId", "restoreFromBackup", "backup"].every(
    (marker) => storeSource.includes(marker),
  );
  const mediaReady = ["ObjectStorage", "createMediaStore", "S3Compatible"].every(
    (marker) => mediaSource.includes(marker),
  );
  return storeReady && mediaReady;
}

/** Add the research, shared-contract, and Practice Relay structural rows. */
export function addCoreDimensions({
  push,
  mustExist,
  read,
  readSourceFamily,
  heavy,
  fx,
}) {
  addResearchDimension({ push, mustExist, read });
  addSharedContractsDimension({ push, mustExist, heavy, fx });
  addDomainDimension({ push, mustExist, readSourceFamily });
  addLtiDimension({ push, mustExist, readSourceFamily, heavy, fx });
  addOpsDimension({ push, mustExist, readSourceFamily, heavy, fx });
  addClassroomDimension({ push, mustExist, read, heavy, fx });
}

function addResearchDimension({ push, mustExist, read }) {
  const files = [
    "PRODUCT.md",
    "docs/EVIDENCE.md",
    "practice-relay/docs/scope.md",
    "mvei/docs/scope.md",
  ];
  const present = presentFiles(files, mustExist);
  const productScope = mustExist(files[0]) ? read(files[0]) : "";
  const mveiScope = mustExist(files[3]) ? read(files[3]) : "";
  const markers =
    /WorkRecord/i.test(productScope) &&
    /MvEI|movement encoding/i.test(mveiScope) &&
    /not (?:a )?user-facing/i.test(productScope);
  const structural = present.length === files.length && markers;
  push({
    id: "research-residual-lock",
    label: "Practice Relay and MvEI research locks",
    target: "strong",
    level: structural ? "strong" : present.length >= 3 ? "lab-mature" : "weak",
    evidence: [
      ...present.map((file) => `exists:${file}`),
      markers ? "current product and MvEI scope markers" : "markers incomplete",
    ],
  });
}

function addSharedContractsDimension({ push, mustExist, heavy, fx }) {
  const packages = [
    "packages/time-core",
    "packages/use-policy",
    "packages/work-record-core",
    "packages/work-record-package",
    "packages/media-index",
    "packages/movement-encode",
    "packages/interop",
  ];
  const count = presentFiles(packages, mustExist).length;
  const schema = mustExist("packages/movement-encode/schemas/mvei-motif-stub.schema.json");
  const workRecordPackage = mustExist("packages/work-record-package/schemas/work-record-package.schema.json");
  const structural = count === packages.length && schema && workRecordPackage;
  const level = elevatedLevel({
    structural,
    present: 0,
    threshold: 0,
    heavy,
    gates: [fx.contracts],
  });
  const contractEvidence = heavy && fx.contracts
    ? [fx.contracts.ok ? fx.contracts.detail : `fx-fail:${fx.contracts.detail}`]
    : ["structural strong bar (heavy contracts check when maturity:check)"];
  push({
    id: "shared-work-record-core-contracts",
    label: "Shared WorkRecord Core contracts",
    target: "strong",
    level,
    evidence: [
      `${count}/${packages.length} packages`,
      schema ? "motif schema" : "no motif schema",
      workRecordPackage ? "work-record package schema" : "no work-record package schema",
      ...contractEvidence,
    ],
  });
}

function addDomainDimension({ push, mustExist, readSourceFamily }) {
  const domain = mustExist("packages/work-record-core/src/index.ts");
  const source = domain ? readSourceFamily({ relativeDirectory: "packages/work-record-core/src" }) : "";
  const structural =
    domain &&
    mustExist("tests/acceptance/q-gates.test.ts") &&
    mustExist("practice-relay/IMPLEMENTATION.md") &&
    hasDomainSurface(source);
  push({
    id: "practice-relay-domain",
    label: "Practice Relay domain (Q1–Q17)",
    target: "strong",
    level: structural ? "strong" : "weak",
    evidence: structural
      ? ["WorkRecord Core API surface", "q-gates tests", "IMPLEMENTATION.md"]
      : ["missing domain artifacts"],
  });
}

function addLtiDimension({ push, mustExist, readSourceFamily, heavy, fx }) {
  const files = [
    "practice-relay/apps/lti/src/index.mjs",
    "practice-relay/apps/lti-mock-platform/src/platform.mjs",
    "practice-relay/apps/lti-mock-platform/src/e2e.test.mjs",
    "practice-relay/docs/lab-only-tier.md",
    "practice-relay/docs/lti-lms-registration.md",
    "practice-relay/docs/lms-registration-preflight.md",
    "scripts/assert-lab-only-procurement.mjs",
    "docker-compose.campus-lab.yml",
  ];
  const present = presentFiles(files, mustExist);
  const multi = hasLtiSurface(readSourceFamily({ relativeDirectory: "practice-relay/apps/lti/src" }));
  const structural = present.length === files.length && multi;
  const level = elevatedLevel({
    structural,
    present: present.length,
    threshold: 5,
    heavy,
    gates: [fx.multiAsset, fx.labOnly],
  });
  const gateEvidence = heavy
    ? [
        fx.multiAsset?.ok
          ? fx.multiAsset.detail
          : `multiAsset-fail:${fx.multiAsset?.detail}`,
        fx.labOnly?.ok
          ? fx.labOnly.detail
          : `labOnly-fail:${fx.labOnly?.detail}`,
      ]
    : [];
  push({
    id: "practice-relay-lti-mock",
    label: "Practice Relay LTI / mock LMS",
    target: "strong",
    level,
    evidence: [
      ...present.map((file) => `exists:${file}`),
      multi ? "multi-asset + JWKS/secret surface" : "LTI incomplete",
      ...gateEvidence,
    ],
    nonClaim: "Not a real Canvas install or IMS certification",
  });
}

function addOpsDimension({ push, mustExist, readSourceFamily, heavy, fx }) {
  const files = [
    "practice-relay/packages/record-store/src/index.ts",
    "practice-relay/packages/media-store/src/index.ts",
    "scripts/ops-restore-drill.mjs",
    "scripts/ops-slo-check.mjs",
    "practice-relay/docs/ops.md",
    "practice-relay/docs/slo.md",
    "docker-compose.production-lab.yml",
    "deploy/README.md",
  ];
  const present = presentFiles(files, mustExist);
  const store = readSourceFamily({ relativeDirectory: "practice-relay/packages/record-store/src" });
  const media = readSourceFamily({ relativeDirectory: "practice-relay/packages/media-store/src" });
  const tenant = hasOpsSurface(store, media);
  const structural = present.length === files.length && tenant;
  const level = elevatedLevel({
    structural,
    present: present.length,
    threshold: 5,
    heavy,
    gates: [fx.opsRestore, fx.opsSlo],
  });
  const gateEvidence = heavy
    ? [
        fx.opsRestore?.ok ? fx.opsRestore.detail : "restore-fail",
        fx.opsSlo?.ok ? fx.opsSlo.detail : "slo-fail",
      ]
    : [];
  push({
    id: "practice-relay-ops",
    label: "Practice Relay single-host storage and ops",
    target: "strong",
    level,
    evidence: [
      ...present.map((file) => `exists:${file}`),
      tenant ? "static tenant prefix + object-store surfaces" : "ops incomplete",
      ...gateEvidence,
    ],
    nonClaim: "Single-process lab adapters and drills, not managed tenancy or multi-region HA",
  });
}

function hasClassroomExportAction(app) {
  return /data-action=["']export["']/.test(app) && /Prepare export/.test(app);
}

function hasClassroomStates(html, app) {
  return /aria-live/.test(html) &&
    /focus-visible/.test(html) &&
    /Loading work records/.test(html) &&
    /No work records/.test(app) &&
    (/data-kind.*error/.test(app) || /Showing an explicit local example/.test(app));
}

function addClassroomDimension({ push, mustExist, read, heavy, fx }) {
  const files = [
    "practice-relay/apps/web/src/index.html",
    "practice-relay/apps/web/src/practice-relay-app.mjs",
    "practice-relay/apps/web/src/shell.mjs",
    "practice-relay/apps/web/src/practice-relay-app.test.mjs",
  ];
  const present = presentFiles(files, mustExist);
  const html = mustExist(files[0]) ? read(files[0]) : "";
  const app = mustExist(files[1]) ? read(files[1]) : "";
  const exportAction = hasClassroomExportAction(app);
  const states = hasClassroomStates(html, app);
  const structural = present.length === files.length && exportAction && states;
  const level = elevatedLevel({
    structural,
    present: present.length,
    threshold: 4,
    heavy,
    gates: [fx.webShell],
  });
  const gateEvidence = heavy
    ? [
        fx.webShell?.ok
          ? fx.webShell.detail
          : `web-shell-fail:${fx.webShell?.detail}`,
      ]
    : [];
  push({
    id: "practice-relay-web",
    label: "Practice Relay web shell",
    target: "strong",
    level,
    evidence: [
      ...present.map((file) => `exists:${file}`),
      exportAction ? "purpose-bound export action" : "export action missing",
      states ? "loading/empty/error + focus/live-region states" : "state or accessibility evidence missing",
      ...gateEvidence,
    ],
  });
}
