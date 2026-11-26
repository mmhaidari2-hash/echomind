/**
 * Photo access — EchoMind's photo library and camera, via the real
 * Capacitor Camera plugin (@capacitor/camera, the official plugin for
 * Capacitor 7). One service for every surface that takes a photo:
 * the chat attach menu and Document Scan (a scanned photo is parsed
 * by the same /documents/parse endpoint as any other file, so the
 * Evidence Locker flow needs no new backend handling).
 *
 * Honest states, never a fake one:
 * - on a native app the plugin is used; permission is checked first
 *   and a denied permission is reported as `denied` with no photo
 *   taken — the UI then tells the owner exactly where to allow it
 *   (Settings → Apps → EchoMind → Permissions);
 * - a user cancelling the picker is `cancelled`, not an error;
 * - on the web there is no plugin, so the call returns
 *   `web-fallback` and the caller uses its hidden file input instead.
 *
 * The real plugin is loaded lazily (dynamic import) so this module is
 * importable in a plain Node test: tests inject stub deps through
 * createPhotoService() and never touch the native plugin.
 */

export type PhotoPermissionState = "granted" | "denied" | "prompt" | "limited";

export type PhotoPermission = PhotoPermissionState | "unavailable";

export type PhotoSource = "library" | "camera";

export type PhotoPickResult =
  | { ok: true; file: File; source: PhotoSource }
  | {
      ok: false;
      reason: "denied" | "cancelled" | "web-fallback" | "unavailable" | "error";
      message?: string;
    };

export type CameraPluginPhoto = {
  webPath?: string;
  dataUrl?: string;
  format?: string;
};

/** The only surface the service needs from the native plugin. */
export type CameraDeps = {
  isNative: () => boolean;
  checkPermissions: () => Promise<{
    camera: PhotoPermissionState;
    photos: PhotoPermissionState;
  }>;
  requestPermissions: () => Promise<{
    camera: PhotoPermissionState;
    photos: PhotoPermissionState;
  }>;
  getPhoto: (options: {
    source: PhotoSource;
    resultType: "uri" | "dataUrl";
  }) => Promise<CameraPluginPhoto>;
};

function normaliseState(
  state: string | undefined,
): PhotoPermissionState {
  if (state === "granted" || state === "denied" || state === "limited") return state;
  return "prompt";
}

function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /cancel/i.test(message);
}

async function photoToFile(
  photo: CameraPluginPhoto,
  source: PhotoSource,
): Promise<File> {
  const format = photo.format === "png" ? "png" : "jpeg";
  const name = `echomind-photo-${Date.now()}.${format === "png" ? "png" : "jpg"}`;
  const fallbackType = `image/${format}`;
  const url = photo.webPath ?? photo.dataUrl;
  if (!url) throw new Error("no-readable-photo");
  const response = await fetch(url);
  if (!response.ok) throw new Error("photo-unreadable");
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || fallbackType });
}

export function createPhotoService(deps: CameraDeps) {
  async function ensurePermission(
    kind: "photos" | "camera",
  ): Promise<"granted" | "denied"> {
    let state = normaliseState((await deps.checkPermissions())[kind]);
    if (state === "granted" || state === "limited") return "granted";
    if (state === "prompt") {
      state = normaliseState((await deps.requestPermissions())[kind]);
      if (state === "granted" || state === "limited") return "granted";
    }
    return "denied";
  }

  async function pick(source: PhotoSource): Promise<PhotoPickResult> {
    if (!deps.isNative()) {
      return { ok: false, reason: "web-fallback" };
    }
    const kind = source === "library" ? "photos" : "camera";
    try {
      const allowed = await ensurePermission(kind);
      if (allowed === "denied") {
        return { ok: false, reason: "denied" };
      }
      const photo = await deps.getPhoto({ source, resultType: "uri" });
      const file = await photoToFile(photo, source);
      return { ok: true, file, source };
    } catch (error) {
      if (isCancellation(error)) return { ok: false, reason: "cancelled" };
      return {
        ok: false,
        reason: "error",
        message: error instanceof Error ? error.message : undefined,
      };
    }
  }

  return {
    /** Current photo permission, without prompting. */
    async checkAccess(kind: "photos" | "camera"): Promise<PhotoPermission> {
      if (!deps.isNative()) return "unavailable";
      try {
        return normaliseState((await deps.checkPermissions())[kind]);
      } catch {
        return "unavailable";
      }
    },
    pickFromLibrary: () => pick("library"),
    takePhoto: () => pick("camera"),
  };
}

export type PhotoService = ReturnType<typeof createPhotoService>;

let realService: PhotoService | null = null;

/** The production service, backed by the real @capacitor/camera plugin. */
export async function getPhotoService(): Promise<PhotoService> {
  if (realService) return realService;
  const [{ Camera, CameraResultType, CameraSource }, { Capacitor }] =
    await Promise.all([import("@capacitor/camera"), import("@capacitor/core")]);
  const deps: CameraDeps = {
    isNative: () => Capacitor.isNativePlatform(),
    checkPermissions: async () => {
      const next = await Camera.checkPermissions();
      return {
        camera: normaliseState(next.camera as string | undefined),
        photos: normaliseState(next.photos as string | undefined),
      };
    },
    requestPermissions: async () => {
      const next = await Camera.requestPermissions();
      return {
        camera: normaliseState(next.camera as string | undefined),
        photos: normaliseState(next.photos as string | undefined),
      };
    },
    getPhoto: async ({ source, resultType }) => {
      const photo = await Camera.getPhoto({
        source: source === "library" ? CameraSource.Photos : CameraSource.Camera,
        resultType:
          resultType === "uri" ? CameraResultType.Uri : CameraResultType.DataUrl,
        quality: 90,
      });
      return {
        webPath: photo.webPath,
        dataUrl: photo.dataUrl,
        format: photo.format,
      };
    },
  };
  realService = createPhotoService(deps);
  return realService;
}
