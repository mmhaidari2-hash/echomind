/**
 * Task-outcome notifications — the notification contract.
 *
 * Mahdi is often busy / on the go: he sends a command and moves on.
 * Silence is dangerous — if EchoMind says nothing, he assumes the task
 * was done. So when a delegated task reaches a terminal state, the app
 * notifies him:
 * - done -> "انجام شد: <task>" / "Done: <task>"
 * - failed -> "انجام نشد، علتش: <reason>" / "Not done — reason: <reason>"
 * - needs_owner -> "نیاز به شما دارد: <reason>" / "Needs you: <reason>"
 *
 * How it works: the app already polls live state (DelegatedWork loads
 * projects + tasks on mount, on focus, and every 30 s via useLiveRefresh).
 * After each load, `taskNotifier.check(tasks, lang)` diffs the statuses
 * against the last-seen map in localStorage and fires a local
 * notification (the already-installed @capacitor/local-notifications,
 * separate channel `echomind-tasks`) for each terminal transition it has
 * not announced yet. A task first seen already finished is recorded
 * silently — opening the app must never flood old finished tasks.
 *
 * Honest limits (see docs/always-answer.md):
 * - local notifications fire when the app is installed and alive /
 *   backgrounded on the phone. True server push for a fully-closed app
 *   needs FCM + a server push sender — not built here.
 * - the plugin forces notification-level VISIBILITY_PRIVATE on every
 *   notification it posts, so lock-screen content is redacted even
 *   though the channel is PUBLIC; the card still shows.
 * - the channel vibrates but plays no sound (no sound file is bundled).
 *
 * The real plugin is loaded lazily (dynamic import) so this module is
 * importable in a plain Node test: tests inject stub deps through
 * createTaskNotifier() and never touch the native plugin.
 */

import type { Locale } from "../app/lib/direction";

/**
 * The task shape the notifier needs. Deliberately local (not imported
 * from ./api): this service must stay importable in a plain Node test,
 * and ./api pulls in the auth layer through the `@/` path alias.
 * DelegatedTask is structurally compatible, so callers pass it as-is.
 */
export type TaskLike = {
  id: string;
  instruction: string;
  status: string;
  result?: string | null;
};

export const TASK_CHANNEL_ID = "echomind-tasks";

/** localStorage key for the last-seen status of every task. */
export const TASK_SEEN_KEY = "echomind.task-status-seen";

export type TaskTerminalStatus = "done" | "failed" | "needs_owner";

export function isTerminalStatus(status: string): status is TaskTerminalStatus {
  return status === "done" || status === "failed" || status === "needs_owner";
}

/** The notification text for a task, or null when it needs no notice. */
export function taskNotificationText(
  task: TaskLike,
  lang: Locale,
): { title: string; body: string } | null {
  const instruction = (task.instruction || "").trim();
  if (task.status === "done") {
    return {
      title: "EchoMind",
      body: lang === "fa" ? `انجام شد: ${instruction}` : `Done: ${instruction}`,
    };
  }
  if (task.status === "failed" || task.status === "needs_owner") {
    const reason = (task.result || "").trim();
    if (task.status === "failed") {
      return {
        title: "EchoMind",
        body:
          lang === "fa"
            ? `انجام نشد، علتش: ${reason}`
            : `Not done — reason: ${reason}`,
      };
    }
    return {
      title: "EchoMind",
      body: lang === "fa" ? `نیاز به شما دارد: ${reason}` : `Needs you: ${reason}`,
    };
  }
  return null;
}

/**
 * Stable notification id for a task. Never 1 — that id is the ongoing
 * Speak notification (channel echomind-voice) and must not be touched.
 */
export function taskNotificationId(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i += 1) {
    hash = (hash * 31 + taskId.charCodeAt(i)) | 0;
  }
  return 2 + (Math.abs(hash) % 100000000);
}

export type TaskStatusMap = Record<string, string>;

export type TaskStatusChange = {
  task: TaskLike;
  from: string | undefined;
  to: string;
};

/** Pure diff: which tasks changed status since the last-seen map. */
export function diffTaskStatuses(
  prev: TaskStatusMap,
  tasks: TaskLike[],
): TaskStatusChange[] {
  const changed: TaskStatusChange[] = [];
  for (const task of tasks) {
    const from = prev[task.id];
    if (from !== task.status) changed.push({ task, from, to: task.status });
  }
  return changed;
}

/** The only surface the notifier needs from the native plugin + storage. */
export type TaskNotifierDeps = {
  isNative: () => Promise<boolean>;
  createChannel: (channel: {
    id: string;
    name: string;
    description: string;
    importance: number;
    visibility: number;
    vibration: boolean;
  }) => Promise<void>;
  schedule: (notification: {
    id: number;
    title: string;
    body: string;
    channelId: string;
    ongoing: boolean;
    autoCancel: boolean;
  }) => Promise<void>;
  loadSeen: () => TaskStatusMap;
  saveSeen: (seen: TaskStatusMap) => void;
};

export function loadSeenStatuses(): TaskStatusMap {
  try {
    const raw = window.localStorage.getItem(TASK_SEEN_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as TaskStatusMap;
    }
    return {};
  } catch {
    return {};
  }
}

export function saveSeenStatuses(seen: TaskStatusMap): void {
  try {
    window.localStorage.setItem(TASK_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* Private mode — the in-memory map below still dedupes this session. */
  }
}

export function createTaskNotifier(deps: TaskNotifierDeps) {
  let channelReady = false;

  async function ensureChannel(lang: Locale): Promise<void> {
    if (channelReady) return;
    await deps.createChannel({
      id: TASK_CHANNEL_ID,
      name: "EchoMind tasks",
      description:
        lang === "fa"
          ? "نتیجهٔ کارهای سپرده‌شده: انجام شد یا نشد و علتش"
          : "Outcomes of delegated tasks: done, failed, and why",
      // DEFAULT: visible in the shade and on the lock screen, no heads-up.
      importance: 3,
      // PUBLIC: full content on the lock screen (the plugin still forces
      // the notification itself to PRIVATE, so the card is redacted there).
      visibility: 1,
      // Vibrate so a finished / failed task is felt on the go; no sound
      // file is bundled, so nothing plays.
      vibration: true,
    });
    channelReady = true;
  }

  /**
   * Announce every terminal transition since the last check. Returns the
   * tasks actually announced. Safe to call on every poll: first sight of
   * a task is recorded silently, and a failed schedule keeps the old
   * seen status so the next poll retries it.
   */
  async function check(
    tasks: TaskLike[],
    lang: Locale,
  ): Promise<TaskStatusChange[]> {
    const seen = deps.loadSeen();
    const changed = diffTaskStatuses(seen, tasks);
    const next: TaskStatusMap = { ...seen };
    for (const task of tasks) {
      if (!isTerminalStatus(task.status)) next[task.id] = task.status;
    }
    const announced: TaskStatusChange[] = [];
    if (!(await deps.isNative())) {
      for (const { task, to } of changed) next[task.id] = to;
      deps.saveSeen(next);
      return announced;
    }
    for (const change of changed) {
      const { task, from, to } = change;
      if (from === undefined) {
        next[task.id] = to;
        continue;
      }
      const text = taskNotificationText(task, lang);
      if (!text) {
        next[task.id] = to;
        continue;
      }
      try {
        await ensureChannel(lang);
        await deps.schedule({
          id: taskNotificationId(task.id),
          title: text.title,
          body: text.body,
          channelId: TASK_CHANNEL_ID,
          ongoing: false,
          autoCancel: true,
        });
        announced.push(change);
        next[task.id] = to;
      } catch {
        /* Keep the old seen status — the next poll retries the notice. */
      }
    }
    deps.saveSeen(next);
    return announced;
  }

  return { check };
}

type LocalNotificationsLike = {
  createChannel: TaskNotifierDeps["createChannel"];
  schedule: (options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      channelId: string;
      ongoing: boolean;
      autoCancel: boolean;
    }>;
  }) => Promise<void>;
};

let pluginPromise: Promise<LocalNotificationsLike> | null = null;

function loadPlugin(): Promise<LocalNotificationsLike> {
  if (!pluginPromise) {
    pluginPromise = import("@capacitor/local-notifications").then(
      (mod) => mod.LocalNotifications as unknown as LocalNotificationsLike,
    );
  }
  return pluginPromise;
}

let nativePromise: Promise<boolean> | null = null;

function loadIsNative(): Promise<boolean> {
  if (!nativePromise) {
    nativePromise = import("../app/lib/native")
      .then((mod) => mod.isNativeApp())
      .catch(() => false);
  }
  return nativePromise;
}

/** The live notifier: real plugin on native, silent no-op on the web. */
export const taskNotifier = createTaskNotifier({
  isNative: loadIsNative,
  createChannel: async (channel) => {
    const plugin = await loadPlugin();
    await plugin.createChannel(channel);
  },
  schedule: async (notification) => {
    const plugin = await loadPlugin();
    await plugin.schedule({ notifications: [notification] });
  },
  loadSeen: loadSeenStatuses,
  saveSeen: saveSeenStatuses,
});
