/**
 * Structural maturity dimensions for MvEI, MvEI Workbench, federation, and readiness.
 *
 * These rows make residual scope explicit while companion functional gates
 * prove executable local workflows without inventing institutional outcomes.
 */
import { readdirSync } from "node:fs";
import {
  elevatedLevel,
  presentFiles,
} from "./maturity-dimension-helpers.mjs";
import {
  hasSafeRepositoryPath,
  resolveExistingRepositoryPath,
} from "./repository-files.mjs";

/** Require both importers and the documented warning taxonomy markers. */
export function hasFederationSurface(source) {
  return [
    "importEafToRecordParts",
    "importOtioToRecordParts",
    "UNKNOWN_TIER",
    "ImportWarning",
  ].every((marker) => source.includes(marker));
}

function isLabanSubsetFixture(name) {
  return name.startsWith("laban-subset") && name.endsWith(".json");
}

/** Add the MvEI, MvEI Workbench, federation, and pilot structural readiness rows. */
export function addReadinessDimensions({
  push,
  mustExist,
  read,
  readSourceFamily,
  heavy,
  fx,
  root,
}) {
  {
    const corpus = "packages/movement-encode/fixtures/corpus";
    const subset = hasSafeRepositoryPath(root, corpus)
      ? readdirSync(resolveExistingRepositoryPath(root, corpus).absolute).filter(isLabanSubsetFixture).length
      : 0;
    const ladder = mustExist("mvei/docs/laban-density-ladder.md");
    const motif = mustExist(
      "packages/movement-encode/schemas/mvei-motif-stub.schema.json",
    );
    const labanSchema = mustExist(
      "packages/movement-encode/schemas/mvei-laban-subset.schema.json",
    );
    const index = mustExist(
      "packages/movement-encode/fixtures/corpus/index.json",
    );
    const structural = motif && labanSchema && ladder && index && subset >= 6;
    const level = elevatedLevel({
      structural,
      present: motif && subset >= 3 ? 3 : 0,
      threshold: 3,
      heavy,
      gates: [fx.schemas],
    });
    const gateEvidence = heavy
      ? [fx.schemas?.ok ? fx.schemas.detail : "schemas-fail"]
      : [];
    push({
      id: "mvei-schemas-ladder",
      label: "MvEI schemas + ladder",
      target: "strong",
      level,
      evidence: [
        motif ? "motif schema" : "no motif schema",
        labanSchema ? "laban-subset schema" : "no laban schema",
        ladder ? "density ladder" : "no ladder",
        index ? "corpus index" : "no index",
        `laban-subset fixtures: ${subset}`,
        ...gateEvidence,
      ],
      nonClaim: "Full professional Laban density deferred",
    });
  }
  {
    const implementations = [
      "mvei/packages/validator",
      "mvei/packages/engraver",
      "mvei/packages/reference-reader",
      "mvei/apps/workbench",
    ];
    const present = presentFiles(implementations, mustExist);
    const structural = present.length >= 3;
    const level = elevatedLevel({
      structural,
      present: 0,
      threshold: 0,
      heavy,
      gates: [fx.tripleImpl],
    });
    const gateEvidence = heavy
      ? [
          fx.tripleImpl?.ok
            ? fx.tripleImpl.detail
            : `triple-impl-fail:${fx.tripleImpl?.detail}`,
        ]
      : ["structural ≥3 impls"];
    push({
      id: "mvei-multi-impl",
      label: "MvEI multi-impl (in-repo)",
      target: "strong",
      level,
      evidence: [...present.map((path) => `impl:${path}`), ...gateEvidence],
    });
  }
  {
    const files = [
      "scripts/publish-dry-run.mjs",
      "docs/publish-and-consume.md",
      "docs/external-implementer-kit.md",
      "docs/recruit-external-implementers.md",
      "packages/movement-encode/fixtures/corpus/index.json",
      "packages/movement-encode/PUBLISH.md",
      "mvei/docs/rfcs/signatures/README.md",
    ];
    const present = presentFiles(files, mustExist);
    const structural = present.length === files.length;
    const level = elevatedLevel({
      structural,
      present: present.length,
      threshold: 4,
      heavy,
      gates: [fx.publish],
    });
    const gateEvidence = heavy
      ? [fx.publish?.ok ? fx.publish.detail : "publish-fail"]
      : [];
    push({
      id: "mvei-external-ecosystem",
      label: "MvEI external-consumption kit",
      target: "strong",
      level,
      evidence: [...present.map((file) => `exists:${file}`), ...gateEvidence],
      nonClaim: "Readiness kit + dry-run only - not live external npm consumers",
    });
  }
  {
    const files = [
      "mvei/apps/workbench/src/motif.mjs",
      "mvei/apps/workbench/src/canvas.mjs",
      "mvei/apps/workbench/src/session-sync.mjs",
      "mvei/apps/workbench/src/history.mjs",
      "mvei/packages/engraver/src/index.ts",
      "mvei/packages/glyph-font/src/index.ts",
      "mvei/apps/workbench/src/laban-subset.mjs",
    ];
    const present = presentFiles(files, mustExist);
    const sync = mustExist(files[2]) ? read(files[2]) : "";
    const engraving = mustExist(files[4]) ? read(files[4]) : "";
    const modes =
      /broadcast/.test(sync) && /yjs/.test(sync) && /memory/.test(sync);
    const print = /renderMotifPrintHtml|renderMotifToSvg/.test(engraving);
    const structural = present.length === files.length && modes && print;
    const level = elevatedLevel({
      structural,
      present: present.length,
      threshold: 5,
      heavy,
      gates: [fx.mveiWorkbenchSync, fx.tripleImpl],
    });
    const gateEvidence = heavy
      ? [
          fx.mveiWorkbenchSync?.ok
            ? fx.mveiWorkbenchSync.detail
            : `mveiWorkbench-fail:${fx.mveiWorkbenchSync?.detail}`,
        ]
      : [];
    push({
      id: "mveiWorkbench-daily",
      label: "MvEI Workbench local authoring",
      target: "strong",
      level,
      evidence: [
        ...present.map((file) => `exists:${file}`),
        modes ? "sync broadcast|yjs|memory" : "sync incomplete",
        print ? "engrave+print API" : "print missing",
        ...gateEvidence,
      ],
    });
  }
  {
    const files = [
      "packages/interop/src/index.ts",
      "packages/interop/LOSS-TAXONOMY.md",
      "packages/interop/src/osc-bridge.ts",
      "scripts/osc-stage-validate.mjs",
      "fixtures/partner-lab/partner-session.eaf",
      "fixtures/partner-lab/partner-nle.otio.json",
      "practice-relay/docs/osc-federation.md",
    ];
    const present = presentFiles(files, mustExist);
    const interop = mustExist(files[0])
      ? readSourceFamily({ relativeDirectory: "packages/interop/src" })
      : "";
    const codes = hasFederationSurface(interop);
    const structural = present.length === files.length && codes;
    const level = elevatedLevel({
      structural,
      present: present.length,
      threshold: 4,
      heavy,
      gates: [fx.federation, fx.osc],
    });
    const gateEvidence = heavy
      ? [
          fx.federation?.ok ? fx.federation.detail : "fed-fail",
          fx.osc?.ok ? fx.osc.detail : "osc-fail",
        ]
      : [];
    push({
      id: "federation",
      label: "Federation OTIO/EAF/OSC",
      target: "strong",
      level,
      evidence: [
        ...present.map((file) => `exists:${file}`),
        codes ? "import + warning codes" : "import incomplete",
        ...gateEvidence,
      ],
    });
  }
  addPilotDimensions({ push, mustExist, read, heavy, fx });
}

/** Add readiness rows for capture, pilots, and sustainability processes. */
function addPilotDimensions({ push, mustExist, read, heavy, fx }) {
  addCapturePilotDimension({ push, mustExist, read, heavy, fx });
  addFacultyPilotReadinessDimension({ push, mustExist, read, heavy, fx });
  addRepositoryGovernanceDimension({ push, mustExist, read, heavy, fx });
}

function hasHonestDecisionLog({ mustExist, read }) {
  if (!mustExist("docs/pilot-pack/decision-log.md")) return false;
  const text = read("docs/pilot-pack/decision-log.md");
  const fake = /multi-site pilot completed|RESULTS:\s*\d+\s*students|pilot PASSED/i.test(text);
  const template = /template|blank|do not invent|TBD|TODO|not yet|placeholder|fill in/i.test(text);
  return !fake || template;
}

function addCapturePilotDimension({ push, mustExist, read, heavy, fx }) {
  const captureFiles = [
    "scripts/capture-lab-demo.ts",
    "docs/pilot-pack/capture-lab.md",
    "scripts/pilot-dry-run.mjs",
    "docs/pilot-pack/dry-run-protocol.md",
    "docs/pilot-pack/decision-log.md",
  ];
  const capture = presentFiles(captureFiles, mustExist);
  const honest = hasHonestDecisionLog({ mustExist, read });
  const captureStructural = capture.length === captureFiles.length && honest;
  const captureLevel = elevatedLevel({
    structural: captureStructural,
    present: capture.length,
    threshold: 4,
    heavy,
    gates: [fx.pilotDryRun],
  });
  const captureGateEvidence = heavy
    ? [
        fx.pilotDryRun?.ok
          ? fx.pilotDryRun.detail
          : `pilot-fail:${fx.pilotDryRun?.detail}`,
      ]
    : [];
  push({
    id: "capture-pilot-dry-run",
    label: "Capture bridge / synthetic dry-run",
    target: "strong",
    level: captureLevel,
    evidence: [
      ...capture.map((file) => `exists:${file}`),
      honest ? "decision-log template-honest" : "decision-log invents results",
      ...captureGateEvidence,
    ],
    nonClaim: "Synthetic fixture readiness only, not participant or pilot evidence",
  });

}

function hasBlankHonestDecisionLog({ mustExist, read }) {
  if (!mustExist("docs/pilot-pack/decision-log.md")) return true;
  const decision = read("docs/pilot-pack/decision-log.md");
  return /template|blank|do not invent|TBD|placeholder|fill in/i.test(decision) || decision.length < 500;
}

function addFacultyPilotReadinessDimension({ push, mustExist, read, heavy, fx }) {
  const pilotFiles = [
    "docs/pilot-pack/README.md",
    "docs/pilot-pack/evaluation-rubric.md",
    "docs/pilot-pack/decision-log.md",
    "docs/pilot-pack/workflow-interview.md",
    "docs/pilot-pack/workflow-observation.md",
    "docs/pilot-pack/artifact-inventory.md",
    "docs/pilot-pack/buyer-map.md",
    "docs/pilot-pack/baseline-pilot-measures.md",
  ];
  const pilot = presentFiles(pilotFiles, mustExist);
  const blankHonest = hasBlankHonestDecisionLog({ mustExist, read });
  const pilotStructural = pilot.length === pilotFiles.length && blankHonest;
  const pilotLevel = elevatedLevel({
    structural: pilotStructural,
    present: pilot.length,
    threshold: 6,
    heavy,
    gates: [fx.pilotDryRun, fx.killSwitches],
  });
  const pilotGateEvidence = heavy
    ? [
        fx.pilotDryRun?.ok ? "pilot dry-run ok" : "pilot dry-run fail",
        fx.killSwitches?.ok ? "kill-switches ok" : "kill-switches fail",
      ]
    : [];
  push({
    id: "faculty-pilots-readiness",
    label: "Neutral handoff study instruments",
    target: "strong",
    level: pilotLevel,
    evidence: [
      ...pilot.map((file) => `exists:${file}`),
      blankHonest ? "decision-log blank-honest" : "decision-log suspicious",
      ...pilotGateEvidence,
    ],
    nonClaim: "Blank instruments only, not participant or institutional results",
  });

}

function addRepositoryGovernanceDimension({ push, mustExist, read, heavy, fx }) {
  const files = [
    "docs/maintainers.md",
    "mvei/docs/dual-rfc.md",
    "mvei/docs/consortium-seed.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "docs/RELEASE-CHECKLIST.md",
  ];
  const present = presentFiles(files, mustExist);
  const maintainers = mustExist(files[0]) ? read(files[0]) : "";
  const dualRfc = mustExist(files[1]) ? read(files[1]) : "";
  const consortium = mustExist(files[2]) ? read(files[2]) : "";
  const processOk =
    /unassigned/i.test(maintainers) &&
    /breaking change|breaking shared-contract/i.test(dualRfc) &&
    /no external organization/i.test(consortium);
  const structural = present.length === files.length && processOk;
  const level = elevatedLevel({
    structural,
    present: present.length,
    threshold: 4,
    heavy,
    gates: [fx.labOnly, fx.killSwitches],
  });
  const gateEvidence = heavy
    ? [
        fx.labOnly?.ok ? "lab-only claims guard" : "lab-only fail",
        fx.killSwitches?.ok ? "kill-switches guard" : "kill-switches fail",
      ]
    : [];
  push({
    id: "repository-governance",
    label: "Repository governance status",
    target: "strong",
    level,
    evidence: [
      ...present.map((file) => `exists:${file}`),
      processOk ? "unassigned roles + dual review + external non-claim" : "process incomplete",
      ...gateEvidence,
    ],
    nonClaim: "Repository process only, with no named maintainers or external consortium",
  });
}
