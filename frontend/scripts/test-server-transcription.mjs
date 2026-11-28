#!/usr/bin/env node
/**
 * Server-transcription tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/services/serverTranscription.ts with the
 * repo's tsc, then exercises it with stub media deps (no real
 * microphone, no network):
 *  - pickRecorderMimeType: prefers webm;codecs=opus, falls back
 *    through the list, returns null when nothing is supported;
 *  - start(): unsupported when there is no MediaRecorder,
 *    not-allowed on NotAllowedError, no-mic on NotFoundError,
 *    error on a generic failure, busy when already recording;
 *  - stop(): no-speech when nothing was recorded, otherwise a blob
 *    of the picked mime type;
 *  - transcribe(): transcript passthrough, and every endpoint error
 *    mapped to the right reason (key-missing / server-old /
 *    server-busy / bad-audio / sign-in / offline / timeout / error);
 *  - the full round-9 flow: start -> stop -> transcribe returns the
 *    text the hook would auto-send.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-server-transcription.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const serviceTs = join(here, "..", "src", "services", "serverTranscription.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-server-transcription-test-"));

const tsc = join(here, "..", "node_modules", ".bin", "tsc");
const compiled = spawnSync(
  tsc,
  [
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
  throw new Error("tsc failed to compile serverTranscription");
}

const { createServerTranscription, pickRecorderMimeType } = await import(
  join(outDir, "serverTranscription.js")
);

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

// ---- fake media deps ----

function fakeStream() {
  return { getTracks: () => [{ stop() {} }] };
}

function makeFakeRecorderClass() {
  // Mirrors the real MediaRecorder surface the service uses:
  // ondataavailable / onstop property handlers (not addEventListener).
  return class FakeMediaRecorder {
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options?.mimeType ?? "audio/webm";
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
      this.onerror = null;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({
        data: new Blob(["audio-bytes"], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  };
}

function makeDeps(overrides = {}) {
  return {
    getUserMedia: async () => fakeStream(),
    MediaRecorderClass: makeFakeRecorderClass(),
    isTypeSupported: () => true,
    transcribe: async () => ({ transcript: "open instagram" }),
    ...overrides,
  };
}

/** ApiError-shaped error (code + status), as api.ts throws it. */
function apiError(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

// ---- pickRecorderMimeType ----

await check("mime type prefers webm;codecs=opus", () => {
  assert.equal(
    pickRecorderMimeType(() => true),
    "audio/webm;codecs=opus",
  );
});

await check("mime type falls back to plain webm", () => {
  const supported = (type) => type === "audio/webm";
  assert.equal(pickRecorderMimeType(supported), "audio/webm");
});

await check("mime type falls back to mp4 when no webm", () => {
  const supported = (type) => type === "audio/mp4";
  assert.equal(pickRecorderMimeType(supported), "audio/mp4");
});

await check("mime type returns empty string when nothing is supported", () => {
  assert.equal(pickRecorderMimeType(() => false), "");
});

// ---- start() failures ----

await check("start unsupported when there is no MediaRecorder", async () => {
  const service = createServerTranscription(
    makeDeps({ MediaRecorderClass: null }),
  );
  const result = await service.start();
  assert.deepEqual(result, { ok: false, reason: "unsupported" });
});

await check("start not-allowed on NotAllowedError", async () => {
  const denied = new Error("Permission denied");
  denied.name = "NotAllowedError";
  const service = createServerTranscription(
    makeDeps({
      getUserMedia: async () => {
        throw denied;
      },
    }),
  );
  const result = await service.start();
  assert.deepEqual(result, { ok: false, reason: "not-allowed" });
});

await check("start no-mic on NotFoundError", async () => {
  const missing = new Error("No device");
  missing.name = "NotFoundError";
  const service = createServerTranscription(
    makeDeps({
      getUserMedia: async () => {
        throw missing;
      },
    }),
  );
  const result = await service.start();
  assert.deepEqual(result, { ok: false, reason: "no-mic" });
});

await check("start error on a generic getUserMedia failure", async () => {
  const service = createServerTranscription(
    makeDeps({
      getUserMedia: async () => {
        throw new Error("boom");
      },
    }),
  );
  const result = await service.start();
  assert.deepEqual(result, { ok: false, reason: "error" });
});

await check("start busy when already recording", async () => {
  const service = createServerTranscription(makeDeps());
  assert.deepEqual(await service.start(), { ok: true });
  assert.deepEqual(await service.start(), { ok: false, reason: "busy" });
  service.release();
});

await check("stop without a recording is an error", async () => {
  const service = createServerTranscription(makeDeps());
  const result = await service.stop();
  assert.deepEqual(result, { ok: false, reason: "error" });
});

// ---- full round-9 flow ----

await check("full flow: start -> stop -> transcribe returns the text", async () => {
  const service = createServerTranscription(makeDeps());
  assert.deepEqual(await service.start(), { ok: true });
  const recorded = await service.stop();
  assert.equal(recorded.ok, true);
  assert.equal(recorded.blob.type, "audio/webm;codecs=opus");
  assert.ok(recorded.blob.size > 0);
  const outcome = await service.transcribe(recorded.blob, "en");
  assert.deepEqual(outcome, { ok: true, transcript: "open instagram" });
});

await check("stop with no chunks is no-speech", async () => {
  const SilentRecorder = class {
    constructor() {
      this.state = "inactive";
      this.ondataavailable = null;
      this.onstop = null;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  };
  const service = createServerTranscription(
    makeDeps({ MediaRecorderClass: SilentRecorder }),
  );
  assert.deepEqual(await service.start(), { ok: true });
  const result = await service.stop();
  assert.deepEqual(result, { ok: false, reason: "no-speech" });
});

await check("release stops the recorder and the stream", async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => (stopped += 1) }] };
  const service = createServerTranscription(
    makeDeps({ getUserMedia: async () => stream }),
  );
  assert.deepEqual(await service.start(), { ok: true });
  service.release();
  assert.equal(stopped, 1);
});

// ---- transcribe() error mapping ----

const errorCases = [
  ["gemini key missing -> key-missing", apiError(503, "gemini_key_missing"), "key-missing"],
  ["404 -> server-old", apiError(404, "endpoint_missing"), "server-old"],
  ["gemini unavailable -> server-busy", apiError(503, "gemini_unavailable"), "server-busy"],
  ["plain 503 -> server-busy", apiError(503, "internal_error"), "server-busy"],
  ["bad audio -> bad-audio", apiError(400, "transcribe_bad_audio"), "bad-audio"],
  ["401 -> sign-in", apiError(401, "auth_session"), "sign-in"],
  ["phone offline -> offline", apiError(503, "phone_offline"), "offline"],
  ["timeout -> timeout", apiError(408, "timeout"), "timeout"],
  ["unknown code -> error", apiError(500, "something_else"), "error"],
];

for (const [name, error, reason] of errorCases) {
  await check(`transcribe: ${name}`, async () => {
    const service = createServerTranscription(
      makeDeps({
        transcribe: async () => {
          throw error;
        },
      }),
    );
    const outcome = await service.transcribe(new Blob(["x"]), "fa");
    assert.deepEqual(outcome, { ok: false, reason });
  });
}

await check("transcribe: plain Error (not an ApiError) -> error", async () => {
  const service = createServerTranscription(
    makeDeps({
      transcribe: async () => {
        throw new Error("network down");
      },
    }),
  );
  const outcome = await service.transcribe(new Blob(["x"]), "en");
  assert.deepEqual(outcome, { ok: false, reason: "error" });
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} server-transcription cases passed`);
