# EchoMind Android — final deployment packaging

Capacitor wraps the Next.js PWA as a native Android app.

| Field | Value |
| --- | --- |
| Application ID | `com.echomind.assistant` |
| Display name | EchoMind Assistant |
| Web assets | `frontend/out` → `frontend/android/app/src/main/assets/public` |
| Canvas / splash | `#090d16` |
| API prefix | `/api/v1` |
| WebView origin | `https://localhost` |

Run all Node commands from `frontend/` unless a repo-root `npm run android:*` script is shown.

---

## 1. Verified environment and endpoint map

These values are what the mobile export actually bakes in. `NEXT_PUBLIC_*` is compiled into the static bundle; changing it later requires a new `export:android` + `cap sync`.

| Variable | Where it lives | Emulator / USB debug | Play / production |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `frontend/.env.local` (copy from an example below) | `http://10.0.2.2:8000/api/v1` | `https://<your-api-host>/api/v1` |
| `CAPACITOR_BUILD` | set by `export:android` | `1` (static export) | `1` |
| `NEXT_DIST_DIR` | set by `export:android` | `.next-android` (does not touch `next dev`) | same |
| `CORS_ORIGINS` | backend `.env` / compose | must include `https://localhost` and `capacitor://localhost` | same, plus your public web origin |
| `ENVIRONMENT` | backend | `development` or `production` | `production` (wildcard `*` CORS is rejected) |
| `GEMINI_API_KEY` | backend only — never the APK | optional; generate stays fail-closed without it | inject via host secrets, not the client |
| `GEMINI_MODEL` | backend | `gemini-2.0-flash` | same unless you change the server |

Example files:

- Emulator: `frontend/.env.android.example`
- Store build: `frontend/.env.android.production.example`
- API CORS: `backend/.env.example`

Client discovery (`frontend/src/services/api.ts`):

1. Uses baked `NEXT_PUBLIC_API_URL` first.
2. On Android WebView, also probes `http://10.0.2.2:8000|8003|8004/api/v1`.
3. Falls back to localhost ports for browser/PWA only.

The emulator host loopback is `10.0.2.2`. Physical devices need your machine LAN IP or a hosted HTTPS API. `127.0.0.1` inside the APK is the phone, not your PC.

Capacitor WebView origin is `https://localhost`. The FastAPI default allowlist already includes `https://localhost`, `http://localhost`, and `capacitor://localhost`.

---

## 2. Verified production assets

| Asset | Role | Native mapping |
| --- | --- | --- |
| `frontend/public/manifest.json` | PWA name, standalone, `#090d16` | copied into `out/` then Android assets |
| `frontend/public/icon.svg` / `icon-maskable.svg` | launcher / maskable | same |
| `frontend/public/offline.html` | Capacitor `server.errorPath` | shown if the shell fails to load |
| `frontend/public/sw.js` | browser PWA cache | **not registered** in the native wrapper |
| `frontend/public/.well-known/assetlinks.json` | Play Digital Asset Links | replace the SHA-256 placeholder before store upload |
| `frontend/android/app/src/main/AndroidManifest.xml` | mic, notifications, camera, network | required for Web Speech and alerts |
| `frontend/android/app/src/main/res/xml/network_security_config.xml` | cleartext only to `10.0.2.2` / localhost | production HTTPS uses system CAs |
| `frontend/android/app/src/main/res/values/colors.xml` | `#090d16` / `#7dd3fc` | splash and status bar |

Confirm the map any time with:

```powershell
npm run test:android
```

---

## 3. Prerequisites

- Node.js 20+
- JDK 17 or 21, with `JAVA_HOME` set
- Android Studio with Android SDK 35 and a device or emulator
- Backend reachable from the device (see the table above)

---

## 4. Immediate Android Studio compile

This is the path that opens the wrapper so you can Build / Run immediately.

```powershell
cd frontend
npm install
copy .env.android.example .env.local
npm run export:android
npx cap sync android
npx cap open android
```

Equivalent from the repo root:

```powershell
npm --prefix frontend install
copy frontend\.env.android.example frontend\.env.local
npm run export:android
npm run android:sync
npm run android:open
```

What those two Capacitor commands do:

1. **`npx cap sync android`** (cwd `frontend/`)  
   Copies `out/` into `android/app/src/main/assets/public`, writes Capacitor plugin registries, and updates Gradle project references.

2. **`npx cap open android`**  
   Opens `frontend/android` in Android Studio.

In Android Studio:

1. Wait for Gradle sync.
2. Select an emulator or a USB device with USB debugging.
3. Click **Run** (debug APK) or **Build → Generate Signed App Bundle / APK**.

Keep the API listening on the host while you run a debug build:

```powershell
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 5. Debug APK from the CLI

```powershell
cd frontend\android
.\gradlew.bat assembleDebug
```

Output: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 6. Signed release APK / Play App Bundle

Do this once per upload key. Do not commit the keystore or passwords.

### 6.1 Create the upload keystore

```powershell
mkdir frontend\android\keystore
keytool -genkeypair -v -keystore frontend\android\keystore\echomind-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias echomind
```

### 6.2 Create `frontend/android/keystore.properties`

Copy `frontend/android/keystore.properties.example` and fill in real secrets:

```
storeFile=keystore/echomind-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=echomind
keyPassword=YOUR_KEY_PASSWORD
```

`app/build.gradle` reads this file and signs `release` when it exists. The file is gitignored.

### 6.3 Bake the production API URL

```powershell
copy frontend\.env.android.production.example frontend\.env.local
```

Edit `NEXT_PUBLIC_API_URL` to your HTTPS `/api/v1` origin. Then:

```powershell
cd frontend
npm run export:android
npx cap sync android
```

### 6.4 Build

**Play App Bundle (required for new Play uploads):**

```powershell
cd frontend\android
.\gradlew.bat bundleRelease
```

Output: `frontend/android/app/build/outputs/bundle/release/app-release.aab`

**Signed APK (sideload / enterprise):**

```powershell
.\gradlew.bat assembleRelease
```

Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

From Android Studio after `npx cap open android`: **Build → Generate Signed App Bundle or APK**, choose the same `echomind-upload.jks`, alias `echomind`.

Bump `versionCode` / `versionName` in `frontend/android/app/build.gradle` before each Play upload.

---

## 7. Play Console and Digital Asset Links

- Application ID must stay `com.echomind.assistant`.
- Replace `REPLACE_WITH_PLAY_UPLOAD_KEY_SHA256` in `frontend/public/.well-known/assetlinks.json` with Play Console → App integrity → App signing.
- Host that file at `https://<your-domain>/.well-known/assetlinks.json`.
- Optional Firebase: add `frontend/android/app/google-services.json`. Gradle applies the Google Services plugin only when that file is present.

---

## 8. Permissions

| Permission | Use |
| --- | --- |
| `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` | Web Speech API microphone |
| `POST_NOTIFICATIONS` / `VIBRATE` | Smart alerts (Android 13+) |
| `CAMERA` | Receipt / ticket capture |
| `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` | Gallery uploads |
| `INTERNET` / `ACCESS_NETWORK_STATE` | API calls |

Microphone and camera are optional hardware features so Play does not hide the app from devices without those sensors.

---

## 9. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `JAVA_HOME is not set` | Install JDK 17/21 from Android Studio and set `JAVA_HOME` |
| API offline in the emulator | Start uvicorn on `0.0.0.0:8000`; use `NEXT_PUBLIC_API_URL=http://10.0.2.2:8000/api/v1` |
| CORS error from the WebView | Backend `CORS_ORIGINS` must include `https://localhost` |
| Old UI after a web change | Re-run `export:android` then `npx cap sync android` |
| Unsigned release | Create `keystore.properties`; Gradle only signs when that file exists |
| Mixed-content / cleartext on a device | Point the export at HTTPS; cleartext is only for emulator hosts |
