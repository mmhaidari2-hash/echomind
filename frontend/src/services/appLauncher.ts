/**
 * Open another app on the phone — the "open Instagram" action.
 *
 * Mahdi said "open the Instagram app" and EchoMind did nothing,
 * because no app-launch action existed at all. This service is the
 * launch side of round 8.
 *
 * Route: the official @capacitor/app-launcher plugin (v7, for
 * Capacitor 7). Its Android implementation opens by package name
 * (getLaunchIntentForPackage) or URL scheme (ACTION_VIEW), and its
 * canOpenUrl answers by package name first. On Android 11+ both
 * need the target declared in AndroidManifest.xml inside <queries>
 * — without that the system reports every app as "not installed"
 * even when it is. The manifest carries the 7 mapped packages plus
 * the 3 known schemes.
 *
 * The service is honest, never silent:
 * - not native (web / PWA) -> "unavailable": apps can only be
 *   opened from the phone app, not from a browser;
 * - target has no package and no scheme (bank) -> "unmapped":
 *   there is no single bank app to open;
 * - nothing installed that answers the package or the scheme ->
 *   "not-installed";
 * - the plugin call itself failed, or the app is installed but
 *   would not launch -> "error".
 *
 * The real plugin is loaded lazily (dynamic import) so this module
 * is importable in a plain Node test: tests inject stub deps
 * through createAppLauncher() and never touch the native plugin.
 * Only https-free targets are used: opening an https:// URL would
 * fall back to the browser when the app is missing, which would
 * look like a success while doing the wrong thing — package and
 * app-scheme targets fail closed instead.
 */

import { OPEN_APP_TARGETS, type OpenAppId } from "../app/lib/openAppCommand";

/** The only surface the service needs from the native plugin. */
export type AppLauncherDeps = {
  isNative: () => boolean;
  canOpenUrl: (url: string) => Promise<{ value: boolean }>;
  openUrl: (url: string) => Promise<{ completed: boolean }>;
};

export type OpenAppResult =
  | { ok: true; appId: OpenAppId }
  | {
      ok: false;
      appId: OpenAppId;
      reason: "not-installed" | "unmapped" | "unavailable" | "error";
    };

export function createAppLauncher(deps: AppLauncherDeps) {
  /** Try one target URL. "opened" means the app actually launched;
      "not-installed" means the check answered no; "error" means the
      plugin call failed or the installed app would not launch. */
  async function tryUrl(
    url: string,
  ): Promise<"opened" | "not-installed" | "error"> {
    let installed: boolean;
    try {
      installed = (await deps.canOpenUrl(url)).value;
    } catch {
      return "error";
    }
    if (!installed) return "not-installed";
    try {
      const opened = await deps.openUrl(url);
      return opened.completed ? "opened" : "error";
    } catch {
      return "error";
    }
  }

  return {
    async openApp(appId: OpenAppId): Promise<OpenAppResult> {
      const target = OPEN_APP_TARGETS[appId];
      if (!target.pkg && !target.scheme) {
        return { ok: false, appId, reason: "unmapped" };
      }
      if (!deps.isNative()) {
        return { ok: false, appId, reason: "unavailable" };
      }
      let sawError = false;
      for (const url of [target.pkg, target.scheme].filter(
        (value): value is string => Boolean(value),
      )) {
        const outcome = await tryUrl(url);
        if (outcome === "opened") return { ok: true, appId };
        if (outcome === "error") sawError = true;
      }
      return {
        ok: false,
        appId,
        reason: sawError ? "error" : "not-installed",
      };
    },
  };
}

export type AppLauncherService = ReturnType<typeof createAppLauncher>;

let realService: AppLauncherService | null = null;

/** The production service, backed by the real @capacitor/app-launcher
    plugin. */
export async function getAppLauncher(): Promise<AppLauncherService> {
  if (realService) return realService;
  const [{ AppLauncher }, { Capacitor }] = await Promise.all([
    import("@capacitor/app-launcher"),
    import("@capacitor/core"),
  ]);
  const deps: AppLauncherDeps = {
    isNative: () => Capacitor.isNativePlatform(),
    canOpenUrl: (url) => AppLauncher.canOpenUrl({ url }),
    openUrl: (url) => AppLauncher.openUrl({ url }),
  };
  realService = createAppLauncher(deps);
  return realService;
}
