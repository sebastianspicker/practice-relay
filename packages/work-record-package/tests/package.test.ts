/** Unit tests for @practice-relay/work-record-package - work-record package + RO-Crate build + validate. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  addTake,
  addTrack,
  attachUsePolicySnapshot,
  attachMveiMotifTrack,
  createEmptyRecord,
  setPreferredTake,
} from "@practice-relay/work-record-core";
import {
  buildWorkRecordPackageManifest,
  buildRoCrateMetadata,
  exportWorkRecordPackage,
  exportWorkRecordPackageZip,
  buildStoreZip,
  validateWorkRecordPackageManifest,
  validateRoCrateMetadata,
  WORK_RECORD_PACKAGE_PROFILE_URI,
  RO_CRATE_CONTEXT,
  RO_CRATE_CONFORMS_TO,
  RO_CRATE_METADATA_PATH,
} from "../src/index.ts";

/** Multi-domain record with Motif ref - real export path input (not a fixture-only sample). */
function multiDomainRecordWithMotif() {
  let s = createEmptyRecord("wr-multi-rocrate", "Week multi-domain export");
  s = addMultiDomainTracks(s);
  s = addMultiDomainTakes(s);
  return attachUsePolicySnapshot(s, {
    id: "c1",
    subjectId: "student-1",
    purposes: ["course_assessment", "formative_feedback"],
    exportAllowed: true,
    createdAt: "2026-07-16T12:00:00.000Z",
  });
}

/** Add the heterogeneous track set used by package and RO-Crate integration tests. */
function addMultiDomainTracks(s: ReturnType<typeof createEmptyRecord>) {
  s = addTrack(s, {
    id: "t-video",
    type: "video",
    label: "Cam",
    ref: "media/a.mp4",
  });
  s = addTrack(s, {
    id: "t-audio",
    type: "audio",
    label: "Ref audio",
    ref: "media/ref.wav",
  });
  s = addTrack(s, {
    id: "t-music",
    type: "music_notation",
    label: "Record",
    ref: "records/piece.musicxml",
  });
  s = addTrack(s, {
    id: "t-move",
    type: "movement_annotation",
    label: "Movement annotation",
    ref: "annotation/move.json",
  });
  s = attachMveiMotifTrack(s, {
    id: "t-mvei",
    label: "MvEI Motif",
    ref: "fixtures/demo/motif.json",
  });
  return s;
}

/** Add the normal and preferred takes used by package export integration tests. */
function addMultiDomainTakes(s: ReturnType<typeof createEmptyRecord>) {
  s = addTake(s, {
    id: "take-01",
    label: "Run 1",
    mediaPath: "media/take-01.mp4",
  });
  s = addTake(s, {
    id: "take-pref",
    label: "Preferred",
    mediaPath: "media/take-pref.mp4",
  });
  s = setPreferredTake(s, "take-pref");
  return s;
}

function recordWithTracksAndConsent() {
  let s = createEmptyRecord("wr-x", "Demo");
  s = addTrack(s, {
    id: "t1",
    type: "video",
    label: "Cam",
    ref: "media/a.mp4",
  });
  s = attachUsePolicySnapshot(s, {
    id: "c1",
    subjectId: "student-1",
    purposes: ["course_assessment"],
    exportAllowed: true,
    createdAt: "2026-07-16T12:00:00.000Z",
  });
  return s;
}

test("buildWorkRecordPackageManifest includes profile URI", () => {
  const s = recordWithTracksAndConsent();
  const m = buildWorkRecordPackageManifest(s, {
    consentAllTagged: true,
    purposes: ["course_assessment"],
  });
  assert.equal(m.profile, WORK_RECORD_PACKAGE_PROFILE_URI);
  assert.equal(m.workRecordId, "wr-x");
  assert.ok(
    m.files.some((f) => f.path === RO_CRATE_METADATA_PATH),
    "manifest.files lists ro-crate-metadata.json",
  );
});

test("buildWorkRecordPackageManifest throws without consent when requireConsent default", () => {
  let s = createEmptyRecord("wr-no", "No consent");
  s = addTrack(s, { id: "t1", type: "video", ref: "m.mp4" });
  assert.throws(() => buildWorkRecordPackageManifest(s), /use policy/i);
  assert.doesNotThrow(() =>
    buildWorkRecordPackageManifest(s, {
      requireConsent: false,
      consentAllTagged: false,
      purposes: [],
    }),
  );
});

test("validateWorkRecordPackageManifest uses real schema from disk", () => {
  const s = recordWithTracksAndConsent();
  const m = buildWorkRecordPackageManifest(s);
  const ok = validateWorkRecordPackageManifest(m);
  assert.equal(ok.ok, true, ok.errors);
});

test("exportWorkRecordPackage returns validated manifest", () => {
  const s = recordWithTracksAndConsent();
  const { manifest, validated } = exportWorkRecordPackage(s);
  assert.equal(validated, true);
  assert.equal(manifest.schemaVersion, "0.4");
  const again = validateWorkRecordPackageManifest(manifest);
  assert.equal(again.ok, true, again.errors);
});

test("exportWorkRecordPackage multi-domain yields work-record package + RO-Crate with matching identity", () => {
  const s = multiDomainRecordWithMotif();
  const { manifest, roCrateMetadata, validated } = exportWorkRecordPackage(s);

  assert.equal(validated, true);

  // work-record package path - real schema validate
  const workRecordPackage = validateWorkRecordPackageManifest(manifest);
  assert.equal(workRecordPackage.ok, true, workRecordPackage.errors);
  assert.equal(manifest.workRecordId, "wr-multi-rocrate");
  assert.equal(manifest.preferredTakeId, "take-pref");
  assert.equal(manifest.mveiRef, "fixtures/demo/motif.json");
  assert.equal(manifest.musicxmlRef, "records/piece.musicxml");
  assert.ok(manifest.tracks.length >= 4);
  const trackTypes = new Set(manifest.tracks.map((t) => t.type));
  assert.ok(trackTypes.has("video"));
  assert.ok(trackTypes.has("music_notation"));
  assert.ok(trackTypes.has("movement_notation"));
  assert.deepEqual(
    manifest.consentSummary.purposes,
    ["course_assessment", "formative_feedback"],
  );

  // RO-Crate 1.3 structural validate on the *shipped builder output*
  const crate = validateRoCrateMetadata(roCrateMetadata);
  assert.equal(crate.ok, true, crate.errors);
  assert.equal(roCrateMetadata["@context"], RO_CRATE_CONTEXT);

  const root = roCrateMetadata["@graph"].find((n) => n["@id"] === "./") as
    | Record<string, unknown>
    | undefined;
  assert.ok(root, "root Data Entity");
  assert.equal(root["workRecord:workRecordId"], manifest.workRecordId);
  assert.equal(root["workRecord:profile"], manifest.profile);
  assert.equal(root["workRecord:preferredTakeId"], manifest.preferredTakeId);
  assert.equal(root["workRecord:mveiRef"], manifest.mveiRef);
  assert.equal(root["workRecord:musicxmlRef"], manifest.musicxmlRef);

  const crateTrackTypes = root["workRecord:trackTypes"] as string[];
  assert.deepEqual(crateTrackTypes, manifest.tracks.map((t) => t.type));

  const consent = root["workRecord:consentSummary"] as {
    purposes: string[];
    allTagged: boolean;
  };
  assert.deepEqual(consent.purposes, manifest.consentSummary.purposes);
  assert.equal(consent.allTagged, manifest.consentSummary.allTagged);

  const descriptor = roCrateMetadata["@graph"].find(
    (n) => n["@id"] === RO_CRATE_METADATA_PATH,
  ) as Record<string, unknown> | undefined;
  assert.ok(descriptor);
  assert.equal(
    (descriptor.conformsTo as { "@id": string })["@id"],
    RO_CRATE_CONFORMS_TO,
  );
});

test("buildRoCrateMetadata alone mirrors manifest work identity", () => {
  const s = multiDomainRecordWithMotif();
  const manifest = buildWorkRecordPackageManifest(s);
  const crate = buildRoCrateMetadata(manifest);
  const root = crate["@graph"].find((n) => n["@id"] === "./") as Record<
    string,
    unknown
  >;
  assert.equal(root["workRecord:workRecordId"], "wr-multi-rocrate");
  assert.ok((root["workRecord:trackTypes"] as string[]).includes("movement_notation"));
});

test("validateRoCrateMetadata rejects bare zip-style empty object", () => {
  const r = validateRoCrateMetadata({});
  assert.equal(r.ok, false);
  assert.match(r.errors ?? "", /@context|@graph/i);
});

test("validateWorkRecordPackageManifest rejects empty tracks", () => {
  const bad = {
    schemaVersion: "0.4",
    profile: "urn:practice-relay:profile:work-record-package:0.4",
    workRecordId: "x",
    title: "t",
    tracks: [],
    takes: [],
    consentSummary: { allTagged: true, purposes: ["a"] },
  };
  const r = validateWorkRecordPackageManifest(bad);
  assert.equal(r.ok, false);
});

test("exportWorkRecordPackageZip produces PK zip with manifests", () => {
  const s = multiDomainRecordWithMotif();
  const pkg = exportWorkRecordPackageZip(s);
  assert.ok(pkg.zipBytes.length > 100);
  assert.equal(pkg.zipBytes[0], 0x50); // P
  assert.equal(pkg.zipBytes[1], 0x4b); // K
  const zip = buildStoreZip([{ path: "a.txt", bytes: "hi" }]);
  assert.equal(zip[0], 0x50);
});

test("exportWorkRecordPackageZip inventories normalized extras in manifest and RO-Crate", () => {
  const asset = Buffer.from("supplementary movement notes", "utf8");
  const pkg = exportWorkRecordPackageZip(multiDomainRecordWithMotif(), {
    extraFiles: [{ path: "notes\\résumé.txt", bytes: asset }],
  });
  const expectedPath = "notes/résumé.txt";
  const expectedHash = createHash("sha256").update(asset).digest("hex");
  const inventory = pkg.manifest.files.find((file) => file.path === expectedPath);
  const root = pkg.roCrateMetadata["@graph"].find((node) => node["@id"] === "./") as Record<string, unknown>;
  const extraEntity = pkg.roCrateMetadata["@graph"].find(
    (node) => node["@id"] === expectedPath,
  ) as Record<string, unknown>;

  assert.deepEqual(inventory, {
    path: expectedPath,
    role: "supplementary-file",
    sha256: expectedHash,
  });
  assert.equal(extraEntity.sha256, expectedHash);
  assert.ok(
    (root.hasPart as { "@id": string }[]).some((part) => part["@id"] === expectedPath),
  );
  assert.deepEqual(zipLocalEntryNames(pkg.zipBytes), [
    "manifest.json",
    RO_CRATE_METADATA_PATH,
    expectedPath,
  ]);
});

test("buildStoreZip marks Unicode entry names as UTF-8 in both ZIP headers", () => {
  const entryName = "records/résumé-演奏.txt";
  const zip = buildStoreZip([{ path: entryName, bytes: "notes" }]);
  const nameBytes = Buffer.from(entryName, "utf8");
  const centralOffset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));

  assert.equal(zip.readUInt16LE(6) & 0x0800, 0x0800);
  assert.ok(centralOffset > 0);
  assert.equal(zip.readUInt16LE(centralOffset + 8) & 0x0800, 0x0800);
  assert.deepEqual(zip.subarray(30, 30 + nameBytes.length), nameBytes);
});

test("buildStoreZip rejects unsafe, duplicate, and platform-colliding entry paths", () => {
  for (const entryPath of [
    "",
    "\0name",
    "/absolute.txt",
    "C:\\drive.txt",
    "\\\\server\\share.txt",
    "nested/../escape.txt",
    "nested/./ambiguous.txt",
  ]) {
    assert.throws(() => buildStoreZip([{ path: entryPath, bytes: "x" }]), /ZIP entry path/);
  }
  assert.throws(
    () =>
      buildStoreZip([
        { path: "same.txt", bytes: "a" },
        { path: "SAME.txt", bytes: "b" },
      ]),
    /duplicate or reserved/,
  );
});

test("exportWorkRecordPackageZip reserves package metadata paths from extra files", () => {
  assert.throws(
    () =>
      exportWorkRecordPackageZip(multiDomainRecordWithMotif(), {
        extraFiles: [{ path: "MANIFEST.json", bytes: Buffer.from("x") }],
      }),
    /duplicate or reserved/,
  );
});

/** Read local ZIP entry names without introducing an archive-parser dependency. */
function zipLocalEntryNames(zip: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = zip.readUInt16LE(offset + 26);
    const dataLength = zip.readUInt32LE(offset + 18);
    const nameStart = offset + 30;
    names.push(zip.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = nameStart + nameLength + dataLength;
  }
  return names;
}
