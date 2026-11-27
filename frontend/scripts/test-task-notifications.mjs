#!/usr/bin/env node
/**
 * Task-notification service tests — runs in plain Node, no phone needed.
 *
 * Compiles frontend/src/services/taskNotifications.ts with the repo's
 * tsc, then exercises it with stubbed native deps:
 *  - texts: done / failed / needs-owner in fa + en, nothing for
 *    running / proposed;
 *  - ids: stable per task, never 1 (the Speak notification's id);
 *  - diff: first sight, change, no change;
 *  - check(): first sight of a finished task is silent; a
 *    running -> done transition schedules one notification on the
 *    echomind-tasks channel; a failed transition carries the reason;
 *    the channel is created once; a failed schedule keeps the old
 *    seen status so the next poll retries;
 *  - web (not native): no schedule calls, seen still advances.
 *
 * Usage (from the frontend verification copy):
 *   node scripts/test-task-notifications.mjs
 * Exit code 0 = all cases pass.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const serviceTs = join(here, "..", "src", "services", "taskNotifications.ts");
const outDir = mkdtempSync(join(tmpdir(), "echomind-task-notif-test-"));

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
  throw new Error("tsc failed to compile taskNotifications.ts");
}

// tsc preserves the src/ tree in the output (the service dynamically
// imports ../app/lib/native), so the compiled file lands in services/.
const {
  TASK_CHANNEL_ID,
  createTaskNotifier,
  diffTaskStatuses,
  taskNotificationId,
  taskNotificationText,
} = await import(join(outDir, "services", "taskNotifications.js"));

function task(overrides = {}) {
  return {
    id: "task-1",
    project_id: "proj-1",
    instruction: "do this in the launcher project",
    language: "en",
    status: "proposed",
    plan: [],
    created_at: "2026-11-27T00:00:00Z",
    updated_at: "2026-11-27T00:00:00Z",
    ...overrides,
  };
}

try {
  // --- texts -----------------------------------------------------------
  assert.equal(
    taskNotificationText(task({ status: "done" }), "fa").body,
    "انجام شد: do this in the launcher project",
  );
  assert.equal(
    taskNotificationText(task({ status: "done" }), "en").body,
    "Done: do this in the launcher project",
  );
  assert.equal(
    taskNotificationText(
      task({ status: "failed", result: "No command hub is connected" }),
      "fa",
    ).body,
    "انجام نشد، علتش: No command hub is connected",
  );
  assert.equal(
    taskNotificationText(
      task({ status: "failed", result: "No command hub is connected" }),
      "en",
    ).body,
    "Not done — reason: No command hub is connected",
  );
  assert.equal(
    taskNotificationText(
      task({ status: "needs_owner", result: "Hub sign-in is missing" }),
      "fa",
    ).body,
    "نیاز به شما دارد: Hub sign-in is missing",
  );
  assert.equal(
    taskNotificationText(
      task({ status: "needs_owner", result: "Hub sign-in is missing" }),
      "en",
    ).body,
    "Needs you: Hub sign-in is missing",
  );
  assert.equal(taskNotificationText(task({ status: "running" }), "fa"), null);
  assert.equal(taskNotificationText(task({ status: "proposed" }), "en"), null);

  // --- ids -------------------------------------------------------------
  assert.equal(taskNotificationId("task-1"), taskNotificationId("task-1"));
  assert.notEqual(taskNotificationId("task-1"), 1);
  assert.notEqual(taskNotificationId("task-1"), taskNotificationId("task-2"));

  // --- diff ------------------------------------------------------------
  assert.deepEqual(diffTaskStatuses({}, [task({ status: "done" })]), [
    { task: task({ status: "done" }), from: undefined, to: "done" },
  ]);
  assert.deepEqual(
    diffTaskStatuses({ "task-1": "running" }, [task({ status: "done" })]),
    [{ task: task({ status: "done" }), from: "running", to: "done" }],
  );
  assert.deepEqual(
    diffTaskStatuses({ "task-1": "done" }, [task({ status: "done" })]),
    [],
  );

  // --- check() with stubbed native deps ---------------------------------
  function stubDeps({ native = true } = {}) {
    const calls = { channels: [], schedules: [] };
    let seen = {};
    let failSchedule = false;
    return {
      calls,
      failSchedule: (value) => {
        failSchedule = value;
      },
      deps: {
        isNative: async () => native,
        createChannel: async (channel) => {
          calls.channels.push(channel);
        },
        schedule: async (notification) => {
          if (failSchedule) throw new Error("denied");
          calls.schedules.push(notification);
        },
        loadSeen: () => ({ ...seen }),
        saveSeen: (next) => {
          seen = { ...next };
        },
      },
      seen: () => ({ ...seen }),
    };
  }

  // First sight of an already-finished task: silent, no schedule.
  {
    const stub = stubDeps();
    const notifier = createTaskNotifier(stub.deps);
    const announced = await notifier.check([task({ status: "done" })], "fa");
    assert.deepEqual(announced, []);
    assert.deepEqual(stub.calls.schedules, []);
    assert.deepEqual(stub.seen(), { "task-1": "done" });
  }

  // running -> done announces once, on the tasks channel, never id 1.
  {
    const stub = stubDeps();
    const notifier = createTaskNotifier(stub.deps);
    await notifier.check([task({ status: "running" })], "fa");
    assert.deepEqual(stub.calls.schedules, []);
    const announced = await notifier.check([task({ status: "done" })], "fa");
    assert.equal(announced.length, 1);
    assert.equal(announced[0].to, "done");
    assert.equal(stub.calls.schedules.length, 1);
    const [note] = stub.calls.schedules;
    assert.equal(note.channelId, TASK_CHANNEL_ID);
    assert.equal(note.body, "انجام شد: do this in the launcher project");
    assert.notEqual(note.id, 1);
    assert.equal(note.ongoing, false);
    // Channel created once, even across two checks.
    assert.equal(stub.calls.channels.length, 1);
    assert.equal(stub.calls.channels[0].id, TASK_CHANNEL_ID);
    assert.equal(stub.calls.channels[0].importance, 3);
    // Third check with no change: nothing new.
    await notifier.check([task({ status: "done" })], "fa");
    assert.equal(stub.calls.schedules.length, 1);
  }

  // running -> failed carries the reason in the body.
  {
    const stub = stubDeps();
    const notifier = createTaskNotifier(stub.deps);
    await notifier.check([task({ status: "running" })], "en");
    await notifier.check(
      [task({ status: "failed", result: "No command hub is connected" })],
      "en",
    );
    assert.equal(stub.calls.schedules.length, 1);
    assert.equal(
      stub.calls.schedules[0].body,
      "Not done — reason: No command hub is connected",
    );
  }

  // A failed schedule keeps the old seen status; the next poll retries.
  {
    const stub = stubDeps();
    const notifier = createTaskNotifier(stub.deps);
    await notifier.check([task({ status: "running" })], "en");
    stub.failSchedule(true);
    const announced = await notifier.check([task({ status: "done" })], "en");
    assert.deepEqual(announced, []);
    assert.deepEqual(stub.calls.schedules, []);
    assert.deepEqual(stub.seen(), { "task-1": "running" });
    stub.failSchedule(false);
    const retried = await notifier.check([task({ status: "done" })], "en");
    assert.equal(retried.length, 1);
    assert.equal(stub.calls.schedules.length, 1);
  }

  // Web (not native): no schedule calls, seen still advances.
  {
    const stub = stubDeps({ native: false });
    const notifier = createTaskNotifier(stub.deps);
    await notifier.check([task({ status: "running" })], "en");
    await notifier.check([task({ status: "done" })], "en");
    assert.deepEqual(stub.calls.schedules, []);
    assert.deepEqual(stub.calls.channels, []);
    assert.deepEqual(stub.seen(), { "task-1": "done" });
  }

  console.log("task notifications: all cases pass");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
