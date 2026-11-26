#!/usr/bin/env node
/**
 * Photo service tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/services/photos.ts with the repo's tsc, then
 * exercises createPhotoService() with stubbed Capacitor deps:
 *  - web (not native) -> web-fallback, never touches the plugin;
 *  - granted permission -> photo becomes a File;
 *  - denied permission -> denied, getPhoto is never called;
 *  - prompt -> request -> granted/denied both handled;
 *  - user cancelling the picker -> cancelled, not an error;
 *  - camera permission denied -> takePhoto denied.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-photos.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const photosTs = join(here, "..", "src", "services", "photos.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-photos-test-"));

const tsc =
  join(here, "..", "node_modules", ".bin", "tsc") || "npx tsc";
const compiled = spawnSync(
  tsc,
  [
    photosTs,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--moduleResolution",
    "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--outDir",
    outDir,
  ],
  { encoding: "utf-8" },
);
if (compiled.status !== 0) {
  console.error(compiled.stdout, compiled.stderr);
  throw new Error("tsc failed to compile photos.ts");
}

const { createPhotoService } = await import(join(outDir, "photos.js"));

// fetch() in Node would hit the network for a webPath; stub it.
const fakeBlob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
globalThis.fetch = async () => new Response(fakeBlob);

function stubDeps(overrides = {}) {
  const calls = { check: 0, request: 0, getPhoto: 0 };
  const deps = {
    isNative: () => true,
    checkPermissions: async () => ({ camera: "granted", photos: "granted" }),
    requestPermissions: async () => ({ camera: "granted", photos: "granted" }),
    getPhoto: async () => ({ webPath: "https://photos.local/shot.jpg", format: "jpeg" }),
    ...overrides,
  };
  const wrapped = {
    isNative: deps.isNative,
    checkPermissions: async (...args) => {
      calls.check += 1;
      return deps.checkPermissions(...args);
    },
    requestPermissions: async (...args) => {
      calls.request += 1;
      return deps.requestPermissions(...args);
    },
    getPhoto: async (...args) => {
      calls.getPhoto += 1;
      return deps.getPhoto(...args);
    },
  };
  return { deps: wrapped, calls };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

try {
  await check("web (not native) returns web-fallback without touching the plugin", async () => {
    const { deps, calls } = stubDeps({ isNative: () => false });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "web-fallback");
    assert.equal(calls.check, 0);
    assert.equal(calls.getPhoto, 0);
  });

  await check("granted library permission returns a File", async () => {
    const { deps } = stubDeps();
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, true);
    assert.equal(result.source, "library");
    assert.ok(result.file instanceof File);
    assert.equal(result.file.type, "image/jpeg");
    assert.match(result.file.name, /^echomind-photo-\d+\.jpg$/);
  });

  await check("denied library permission returns denied and never opens the picker", async () => {
    const { deps, calls } = stubDeps({
      checkPermissions: async () => ({ camera: "granted", photos: "denied" }),
    });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "denied");
    assert.equal(calls.getPhoto, 0);
  });

  await check("prompt permission is requested, then the photo is taken", async () => {
    const { deps, calls } = stubDeps({
      checkPermissions: async () => ({ camera: "granted", photos: "prompt" }),
      requestPermissions: async () => ({ camera: "granted", photos: "granted" }),
    });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, true);
    assert.equal(calls.request, 1);
    assert.equal(calls.getPhoto, 1);
  });

  await check("prompt permission refused on request returns denied", async () => {
    const { deps, calls } = stubDeps({
      checkPermissions: async () => ({ camera: "granted", photos: "prompt" }),
      requestPermissions: async () => ({ camera: "granted", photos: "denied" }),
    });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "denied");
    assert.equal(calls.getPhoto, 0);
  });

  await check("user cancelling the picker returns cancelled, not an error", async () => {
    const { deps } = stubDeps({
      getPhoto: async () => {
        throw new Error("User cancelled photos app");
      },
    });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cancelled");
  });

  await check("denied camera permission blocks takePhoto", async () => {
    const { deps, calls } = stubDeps({
      checkPermissions: async () => ({ camera: "denied", photos: "granted" }),
    });
    const service = createPhotoService(deps);
    const result = await service.takePhoto();
    assert.equal(result.ok, false);
    assert.equal(result.reason, "denied");
    assert.equal(calls.getPhoto, 0);
  });

  await check("checkAccess reports the real permission without prompting", async () => {
    const { deps, calls } = stubDeps({
      checkPermissions: async () => ({ camera: "granted", photos: "limited" }),
    });
    const service = createPhotoService(deps);
    assert.equal(await service.checkAccess("photos"), "limited");
    assert.equal(await service.checkAccess("camera"), "granted");
    assert.equal(calls.request, 0);
  });

  await check("limited permission counts as granted", async () => {
    const { deps } = stubDeps({
      checkPermissions: async () => ({ camera: "granted", photos: "limited" }),
    });
    const service = createPhotoService(deps);
    const result = await service.pickFromLibrary();
    assert.equal(result.ok, true);
  });

  console.log(`\n${passed} photo tests passed`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
