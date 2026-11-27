#!/usr/bin/env node
/**
 * Native speech service tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/services/speech.ts with the repo's tsc, then
 * exercises createNativeSpeech() with a stub plugin:
 *  - happy path: permission granted + recognizer available -> start is
 *    called with fa-IR, popup false, partialResults true; partial
 *    results arrive live; a stopped session commits the last text as
 *    final;
 *  - permission denied -> not-allowed, start never called;
 *  - permission prompt -> requested, granted -> starts;
 *  - recognizer unavailable / plugin missing -> unsupported;
 *  - start rejecting with a network message -> network code;
 *  - restart on the same service registers listeners only once;
 *  - stop() ends the session, release() removes the listeners.
 *  - round 4: probe() reports the on-device service (Google app
 *    present/missing/timeout, languages) and is cached; stop() never
 *    waits for the plugin's stop() (it never resolves); release()
 *    stops the recognizer before removing the listeners.
 *  - round 7: takeLastText() reads back the final onResults text that
 *    arrives as a late partialResults event after stop(); mergeLateFinal()
 *    replaces (never duplicates) a committed interim when the final
 *    text extends it.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-speech.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const serviceTs = join(here, "..", "src", "services", "speech.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-speech-test-"));

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
  throw new Error("tsc failed to compile speech.ts");
}

const { createNativeSpeech, mergeLateFinal } = await import(join(outDir, "speech.js"));

function stubPlugin(overrides = {}) {
  const listeners = { partialResults: [], listeningState: [] };
  const calls = { start: [], stop: 0, removed: 0, available: 0 };
  const state = {
    permission: "granted",
    requestResult: "granted",
    available: true,
    startError: null,
    languages: ["fa-IR", "en-GB"],
    languagesHang: false,
  };
  return {
    listeners,
    calls,
    state,
    plugin: {
      available: async () => {
        calls.available += 1;
        return { available: state.available };
      },
      checkPermissions: async () => ({
        speechRecognition: state.permission,
      }),
      requestPermissions: async () => ({
        speechRecognition: state.requestResult,
      }),
      getSupportedLanguages: async () => {
        if (state.languagesHang) return new Promise(() => {});
        return { languages: state.languages };
      },
      start: async (options) => {
        calls.start.push(options);
        if (state.startError) throw new Error(state.startError);
        return {};
      },
      stop: async () => {
        calls.stop += 1;
      },
      addListener: async (event, cb) => {
        listeners[event].push(cb);
        return {
          remove: async () => {
            calls.removed += 1;
          },
        };
      },
    },
    firePartial: (text) => {
      for (const cb of listeners.partialResults) cb({ matches: [text] });
    },
    fireState: (status) => {
      for (const cb of listeners.listeningState) cb({ status });
    },
  };
}

function callbacks() {
  const seen = { started: 0, partials: [], finals: [], stopped: [] };
  return {
    seen,
    cbs: {
      onStarted: () => {
        seen.started += 1;
      },
      onPartial: (text) => {
        seen.partials.push(text);
      },
      onFinal: (text) => {
        seen.finals.push(text);
      },
      onStopped: (hadText) => {
        seen.stopped.push(hadText);
      },
    },
  };
}

try {
  // --- happy path --------------------------------------------------------
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { seen, cbs } = callbacks();
    const result = await speech.start("fa-IR", cbs);
    assert.deepEqual(result, { ok: true });
    assert.equal(stub.calls.start.length, 1);
    assert.deepEqual(stub.calls.start[0], {
      language: "fa-IR",
      maxResults: 1,
      popup: false,
      partialResults: true,
    });
    stub.fireState("started");
    assert.equal(seen.started, 1);
    stub.firePartial("برو تو");
    stub.firePartial("برو تو اینستاگرام");
    assert.deepEqual(seen.partials, ["برو تو", "برو تو اینستاگرام"]);
    stub.fireState("stopped");
    assert.deepEqual(seen.finals, ["برو تو اینستاگرام"]);
    assert.deepEqual(seen.stopped, [true]);
  }

  // --- empty session: stopped with no text --------------------------------
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { seen, cbs } = callbacks();
    await speech.start("fa-IR", cbs);
    stub.fireState("stopped");
    assert.deepEqual(seen.finals, []);
    assert.deepEqual(seen.stopped, [false]);
  }

  // --- permission denied ---------------------------------------------------
  {
    const stub = stubPlugin();
    stub.state.permission = "denied";
    stub.state.requestResult = "denied";
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    const result = await speech.start("fa-IR", cbs);
    assert.deepEqual(result, { ok: false, code: "not-allowed" });
    assert.equal(stub.calls.start.length, 0);
  }

  // --- permission prompt -> granted -----------------------------------------
  {
    const stub = stubPlugin();
    stub.state.permission = "prompt";
    stub.state.requestResult = "granted";
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    const result = await speech.start("en-GB", cbs);
    assert.deepEqual(result, { ok: true });
    assert.equal(stub.calls.start[0].language, "en-GB");
  }

  // --- recognizer unavailable / plugin missing ------------------------------
  {
    const stub = stubPlugin();
    stub.state.available = false;
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    assert.deepEqual(await speech.start("fa-IR", cbs), {
      ok: false,
      code: "unsupported",
    });
    assert.equal(stub.calls.start.length, 0);

    const missing = createNativeSpeech({ loadPlugin: async () => null });
    assert.deepEqual(await missing.start("fa-IR", cbs), {
      ok: false,
      code: "unsupported",
    });
  }

  // --- start rejection maps to a code -----------------------------------------
  {
    const stub = stubPlugin();
    stub.state.startError = "Network error";
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    assert.deepEqual(await speech.start("fa-IR", cbs), {
      ok: false,
      code: "network",
    });
  }

  // --- restart registers listeners once; stop + release -----------------------
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    await speech.start("fa-IR", cbs);
    await speech.start("fa-IR", cbs);
    assert.equal(stub.listeners.partialResults.length, 1);
    assert.equal(stub.listeners.listeningState.length, 1);
    assert.equal(stub.calls.start.length, 2);
    await speech.stop();
    assert.equal(stub.calls.stop, 1);
    await speech.release();
    assert.equal(stub.calls.removed, 2);
  }

  // --- probe: service present, languages reported, cached ---------------------
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
      probeTimeoutMs: 200,
    });
    const probe = await speech.probe();
    assert.deepEqual(probe, {
      available: true,
      permission: "granted",
      googleService: "ok",
      languages: ["fa-IR", "en-GB"],
    });
    const again = await speech.probe();
    assert.equal(again, probe);
    assert.equal(stub.calls.available, 1);
  }

  // --- probe: no getSupportedLanguages -> unchecked ----------------------------
  {
    const stub = stubPlugin();
    delete stub.plugin.getSupportedLanguages;
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
      probeTimeoutMs: 200,
    });
    const probe = await speech.probe();
    assert.equal(probe.googleService, "unchecked");
    assert.deepEqual(probe.languages, []);
  }

  // --- probe: Google app broadcast hangs -> timeout ------------------------------
  {
    const stub = stubPlugin();
    stub.state.languagesHang = true;
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
      probeTimeoutMs: 50,
    });
    const probe = await speech.probe();
    assert.equal(probe.googleService, "timeout");
  }

  // --- probe: plugin missing -> service-missing facts ------------------------------
  {
    const speech = createNativeSpeech({
      loadPlugin: async () => null,
      probeTimeoutMs: 200,
    });
    const probe = await speech.probe();
    assert.deepEqual(probe, {
      available: false,
      permission: "denied",
      googleService: "missing",
      languages: [],
    });
  }

  // --- stop() never waits for the plugin's stop() (it never resolves) --------------
  {
    const stub = stubPlugin();
    stub.plugin.stop = () => new Promise(() => {});
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    await speech.start("fa-IR", cbs);
    const result = await Promise.race([
      speech.stop().then(() => "returned"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 300)),
    ]);
    assert.equal(result, "returned");
  }

  // --- release() stops the recognizer before removing listeners ----------------------
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { cbs } = callbacks();
    await speech.start("fa-IR", cbs);
    await speech.release();
    assert.equal(stub.calls.stop, 1);
    assert.equal(stub.calls.removed, 2);
  }

  // --- round 7: takeLastText() harvests the late final -------------------------
  // The plugin delivers the final onResults matches as a partialResults
  // event AFTER stop() — after the hook's generation guard stopped
  // listening. The hook reads it back through takeLastText().
  {
    const stub = stubPlugin();
    const speech = createNativeSpeech({
      loadPlugin: async () => stub.plugin,
    });
    const { seen, cbs } = callbacks();
    await speech.start("fa-IR", cbs);
    stub.firePartial("سلام");
    assert.deepEqual(seen.partials, ["سلام"]);
    await speech.stop();
    // The final result arrives late, after the stop (onResults).
    stub.firePartial("سلام، حقوق مصرف‌کننده من چیست؟");
    assert.equal(
      speech.takeLastText(),
      "سلام، حقوق مصرف‌کننده من چیست؟",
    );
    // Taking clears it — a second harvest finds nothing.
    assert.equal(speech.takeLastText(), "");
    // A fresh start also clears it.
    await speech.start("fa-IR", cbs);
    assert.equal(speech.takeLastText(), "");
  }

  // --- round 7: mergeLateFinal() never duplicates the interim ------------------
  {
    // The final extends the committed interim: replace, not append.
    assert.equal(
      mergeLateFinal("سلام", "سلام", "سلام، حقوق مصرف‌کننده من چیست؟"),
      "سلام، حقوق مصرف‌کننده من چیست؟",
    );
    // The final equals the committed interim: unchanged.
    assert.equal(mergeLateFinal("سلام", "سلام", "سلام"), "سلام");
    // The final is unrelated: appended.
    assert.equal(
      mergeLateFinal(
        "برو تو اینستاگرام",
        "برو تو اینستاگرام",
        "ایمیلم را چک کن",
      ),
      "برو تو اینستاگرام ایمیلم را چک کن",
    );
    // Empty late text: base unchanged.
    assert.equal(mergeLateFinal("سلام", "سلام", ""), "سلام");
    // Empty base: the late text stands alone.
    assert.equal(mergeLateFinal("", "", "سلام"), "سلام");
    // The late text is already the tail: unchanged.
    assert.equal(mergeLateFinal("سلام دنیا", "", "دنیا"), "سلام دنیا");
  }

  console.log("speech: all cases pass");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
