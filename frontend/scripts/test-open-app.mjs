#!/usr/bin/env node
/**
 * Open-app command tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/app/lib/openAppCommand.ts and
 * frontend/src/services/appLauncher.ts with the repo's tsc, then
 * exercises them with stub plugin deps (the native plugin is never
 * touched):
 *  - parser: every known app in English and Persian, the "please" /
 *    «لطفا» forms, "open the X app", "go to X", unknown apps, and
 *    chat messages that must NOT match ("open the claim for my
 *    train", "open the drive to the airport");
 *  - launcher: not-native -> unavailable; bank -> unmapped (no
 *    plugin calls); installed -> opened with the right package;
 *    not installed -> not-installed and openUrl never called;
 *    installed but won't launch -> error; plugin throws -> error;
 *    package missing but scheme works -> opened via the scheme.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-open-app.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const parserTs = join(here, "..", "src", "app", "lib", "openAppCommand.ts");
const serviceTs = join(here, "..", "src", "services", "appLauncher.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-open-app-test-"));

const tsc = join(here, "..", "node_modules", ".bin", "tsc");
const compiled = spawnSync(
  tsc,
  [
    parserTs,
    serviceTs,
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
  throw new Error("tsc failed to compile openAppCommand/appLauncher");
}

const { parseOpenAppCommand } = await import(
  join(outDir, "app", "lib", "openAppCommand.js")
);
const { createAppLauncher } = await import(
  join(outDir, "services", "appLauncher.js")
);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// ---- parser: English ----
const enOpen = [
  ["open Instagram", "instagram"],
  ["Open the Instagram app", "instagram"],
  ["launch youtube", "youtube"],
  ["open google drive", "drive"],
  ["open Google Docs", "docs"],
  ["open sheets", "sheets"],
  ["open calendar", "calendar"],
  ["open gmail", "gmail"],
  ["open bank", "bank"],
  ["please open instagram", "instagram"],
  ["open instagram.", "instagram"],
  ["go to youtube", "youtube"],
  ["open insta", "instagram"],
  ["open google calendar", "calendar"],
];
for (const [text, appId] of enOpen) {
  await check(`EN "${text}" -> open ${appId}`, () => {
    assert.deepEqual(parseOpenAppCommand(text), {
      kind: "open",
      appId,
    });
  });
}

// ---- parser: Persian ----
const faOpen = [
  ["اینستا رو باز کن", "instagram"],
  ["اپ اینستا رو باز کن", "instagram"],
  ["باز کن اینستاگرام", "instagram"],
  ["اینستاگرام رو باز کن", "instagram"],
  ["یوتیوب رو باز کن", "youtube"],
  ["جیمیل رو باز کن", "gmail"],
  ["تقویم رو باز کن", "calendar"],
  ["درایو رو باز کن", "drive"],
  ["داکس رو باز کن", "docs"],
  ["شیت رو باز کن", "sheets"],
  ["بانک رو باز کن", "bank"],
  ["لطفا اینستا رو باز کن", "instagram"],
  ["باز کن اینستاگرام رو", "instagram"],
  ["کالندر رو باز کن", "calendar"],
];
for (const [text, appId] of faOpen) {
  await check(`FA "${text}" -> open ${appId}`, () => {
    assert.deepEqual(parseOpenAppCommand(text), {
      kind: "open",
      appId,
    });
  });
}

// ---- parser: unknown apps ----
await check('EN "open foo" -> unknown "foo"', () => {
  assert.deepEqual(parseOpenAppCommand("open foo"), {
    kind: "unknown",
    name: "foo",
  });
});
await check('FA "فو رو باز کن" -> unknown "فو"', () => {
  assert.deepEqual(parseOpenAppCommand("فو رو باز کن"), {
    kind: "unknown",
    name: "فو",
  });
});

// ---- parser: must NOT match (falls through to chat) ----
const notCommands = [
  "hello",
  "open the claim for my train",
  "open the drive to the airport",
  "I want to open instagram",
  "اینستاگرام چیه؟",
  "open the document for my claim",
  "",
  "   ",
];
for (const text of notCommands) {
  await check(`not a command: "${text}"`, () => {
    assert.equal(parseOpenAppCommand(text), null);
  });
}

// ---- launcher service (stub plugin deps) ----
function stubDeps({ native = true, canOpen = {}, open = {} } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      isNative: () => native,
      canOpenUrl: async (url) => {
        calls.push(["canOpenUrl", url]);
        if (canOpen[url] instanceof Error) throw canOpen[url];
        return { value: canOpen[url] ?? false };
      },
      openUrl: async (url) => {
        calls.push(["openUrl", url]);
        if (open[url] instanceof Error) throw open[url];
        return { completed: open[url] ?? false };
      },
    },
  };
}

await check("not native -> unavailable, plugin never called", async () => {
  const { calls, deps } = stubDeps({ native: false });
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("instagram"), {
    ok: false,
    appId: "instagram",
    reason: "unavailable",
  });
  assert.deepEqual(calls, []);
});

await check("bank -> unmapped, plugin never called", async () => {
  const { calls, deps } = stubDeps();
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("bank"), {
    ok: false,
    appId: "bank",
    reason: "unmapped",
  });
  assert.deepEqual(calls, []);
});

await check("installed instagram -> opened via package", async () => {
  const { calls, deps } = stubDeps({
    canOpen: { "com.instagram.android": true },
    open: { "com.instagram.android": true },
  });
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("instagram"), {
    ok: true,
    appId: "instagram",
  });
  assert.deepEqual(calls, [
    ["canOpenUrl", "com.instagram.android"],
    ["openUrl", "com.instagram.android"],
  ]);
});

await check(
  "not installed -> not-installed, openUrl never called",
  async () => {
    const { calls, deps } = stubDeps();
    const service = createAppLauncher(deps);
    assert.deepEqual(await service.openApp("youtube"), {
      ok: false,
      appId: "youtube",
      reason: "not-installed",
    });
    assert.deepEqual(calls, [
      ["canOpenUrl", "com.google.android.youtube"],
      ["canOpenUrl", "vnd.youtube://"],
    ]);
  },
);

await check("installed but won't launch -> error", async () => {
  const { deps } = stubDeps({
    canOpen: { "com.google.android.gm": true },
    open: { "com.google.android.gm": false },
  });
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("gmail"), {
    ok: false,
    appId: "gmail",
    reason: "error",
  });
});

await check("plugin throws -> error", async () => {
  const { deps } = stubDeps({
    canOpen: { "com.instagram.android": new Error("no bridge") },
  });
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("instagram"), {
    ok: false,
    appId: "instagram",
    reason: "error",
  });
});

await check("package missing but scheme works -> opened via scheme", async () => {
  const { calls, deps } = stubDeps({
    canOpen: { "com.instagram.android": false, "instagram://": true },
    open: { "instagram://": true },
  });
  const service = createAppLauncher(deps);
  assert.deepEqual(await service.openApp("instagram"), {
    ok: true,
    appId: "instagram",
  });
  assert.deepEqual(calls, [
    ["canOpenUrl", "com.instagram.android"],
    ["canOpenUrl", "instagram://"],
    ["openUrl", "instagram://"],
  ]);
});

rmSync(outDir, { recursive: true, force: true });

console.log(`test-open-app: ${passed} cases passed`);
