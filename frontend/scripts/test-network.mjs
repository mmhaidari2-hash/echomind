#!/usr/bin/env node
/**
 * Phone network-state tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/services/network.ts with the repo's tsc, then
 * exercises isPhoneOnline() / onPhoneNetworkChange() with stubbed
 * globals:
 *  - no navigator at all -> online (fail open; the health probe
 *    decides instead of blocking the call);
 *  - navigator.onLine true -> online; false -> offline;
 *  - online/offline window events call the listener with the new
 *    state; unsubscribe stops the calls;
 *  - no window at all -> onPhoneNetworkChange is a no-op that
 *    returns a callable unsubscribe.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-network.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const serviceTs = join(here, "..", "src", "services", "network.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-network-test-"));

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
  throw new Error("tsc failed to compile network.ts");
}

const { isPhoneOnline, onPhoneNetworkChange } = await import(
  join(outDir, "network.js")
);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} - ${name}`);
}

function stubNavigator(onLine) {
  globalThis.navigator = { onLine };
}

function stubWindow() {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    fire: (type) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    count: (type) => listeners.get(type)?.size ?? 0,
  };
}

const savedNavigator = globalThis.navigator;
const savedWindow = globalThis.window;

try {
  check("no navigator -> online (fail open)", () => {
    delete globalThis.navigator;
    assert.equal(isPhoneOnline(), true);
  });

  check("navigator.onLine true -> online", () => {
    stubNavigator(true);
    assert.equal(isPhoneOnline(), true);
  });

  check("navigator.onLine false -> offline", () => {
    stubNavigator(false);
    assert.equal(isPhoneOnline(), false);
  });

  check("online/offline events reach the listener", () => {
    const win = stubWindow();
    const seen = [];
    const unsubscribe = onPhoneNetworkChange((online) => seen.push(online));
    win.fire("offline");
    win.fire("online");
    win.fire("offline");
    assert.deepEqual(seen, [false, true, false]);
    unsubscribe();
    win.fire("online");
    assert.deepEqual(seen, [false, true, false]);
    assert.equal(win.count("online"), 0);
    assert.equal(win.count("offline"), 0);
  });

  check("no window -> no-op unsubscribe", () => {
    delete globalThis.window;
    const unsubscribe = onPhoneNetworkChange(() => {
      throw new Error("must not be called");
    });
    assert.equal(typeof unsubscribe, "function");
    unsubscribe();
  });
} finally {
  if (savedNavigator === undefined) delete globalThis.navigator;
  else globalThis.navigator = savedNavigator;
  if (savedWindow === undefined) delete globalThis.window;
  else globalThis.window = savedWindow;
  rmSync(outDir, { recursive: true, force: true });
}

console.log(`test-network: ${passed} cases passed`);
