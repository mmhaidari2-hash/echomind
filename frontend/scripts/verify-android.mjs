import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..");

function read(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing file: ${path}`);
  }
  return readFileSync(path, "utf8");
}

function mustInclude(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} is missing ${needle}`);
  }
}

const configPath = join(root, "capacitor.config.json");
const manifestPath = join(root, "android", "app", "src", "main", "AndroidManifest.xml");
const gradlePath = join(root, "android", "app", "build.gradle");
const networkPath = join(root, "android", "app", "src", "main", "res", "xml", "network_security_config.xml");
const colorsPath = join(root, "android", "app", "src", "main", "res", "values", "colors.xml");
const stringsPath = join(root, "android", "app", "src", "main", "res", "values", "strings.xml");
const apiPath = join(root, "src", "services", "api.ts");
const backendEnv = join(repo, "backend", ".env.example");
const androidEnv = join(root, ".env.android.example");
const androidProdEnv = join(root, ".env.android.production.example");
const docs = join(repo, "ANDROID.md");

const config = JSON.parse(read(configPath));
if (config.appId !== "com.echomind.assistant") {
  throw new Error("capacitor.config.json appId must be com.echomind.assistant");
}
if (config.webDir !== "out") {
  throw new Error("capacitor.config.json webDir must be out");
}
if (config.backgroundColor !== "#090d16" || config.android?.backgroundColor !== "#090d16") {
  throw new Error("capacitor.config.json must keep the EchoMind canvas color");
}
if (config.server?.androidScheme !== "https" || config.server?.hostname !== "localhost") {
  throw new Error("Capacitor WebView must use https://localhost");
}
if (config.server?.errorPath !== "offline.html") {
  throw new Error("capacitor.config.json server.errorPath must be offline.html");
}
if (config.android?.buildOptions?.releaseType !== "AAB") {
  throw new Error("Play default releaseType must be AAB");
}

for (const relative of [
  "public/manifest.json",
  "public/icon.svg",
  "public/icon-maskable.svg",
  "public/offline.html",
  "public/sw.js",
  "public/.well-known/assetlinks.json",
]) {
  read(join(root, relative));
}

const pwaManifest = JSON.parse(read(join(root, "public", "manifest.json")));
if (pwaManifest.background_color !== "#090d16" || pwaManifest.theme_color !== "#090d16") {
  throw new Error("PWA manifest canvas color drifted from #090d16");
}

const manifest = read(manifestPath);
for (const token of [
  "android.permission.RECORD_AUDIO",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.CAMERA",
  "android.permission.INTERNET",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.hardware.microphone",
  "android.hardware.camera",
  "network_security_config",
]) {
  mustInclude(manifest, token, "AndroidManifest.xml");
}

const gradle = read(gradlePath);
mustInclude(gradle, 'applicationId "com.echomind.assistant"', "app/build.gradle");
mustInclude(gradle, "keystore.properties", "app/build.gradle");
mustInclude(gradle, "signingConfigs", "app/build.gradle");

mustInclude(read(stringsPath), "EchoMind Assistant", "strings.xml");
mustInclude(read(colorsPath), "#090d16", "colors.xml");

const network = read(networkPath);
mustInclude(network, "10.0.2.2", "network_security_config.xml");
mustInclude(network, "cleartextTrafficPermitted", "network_security_config.xml");

const api = read(apiPath);
mustInclude(api, "/api/v1", "api.ts");
mustInclude(api, "10.0.2.2", "api.ts");
mustInclude(api, "NEXT_PUBLIC_API_URL", "api.ts");

mustInclude(read(androidEnv), "http://192.168.1.49:8000/api/v1", ".env.android.example");
mustInclude(read(androidEnv), "NEXT_PUBLIC_DEV_HOST", ".env.android.example");
mustInclude(read(androidEnv), "192.168.", ".env.android.example");
mustInclude(read(apiPath), "NEXT_PUBLIC_DEV_HOST", "api.ts");
mustInclude(read(androidProdEnv), "https://", ".env.android.production.example");
mustInclude(read(androidProdEnv), "/api/v1", ".env.android.production.example");

const cors = read(backendEnv);
mustInclude(cors, "https://localhost", "backend/.env.example");
mustInclude(cors, "capacitor://localhost", "backend/.env.example");

const guide = read(docs);
for (const token of ["npx cap sync android", "npx cap open android", "bundleRelease", "assembleRelease", "NEXT_PUBLIC_API_URL"]) {
  mustInclude(guide, token, "ANDROID.md");
}

console.log("Mobile env, API /api/v1 endpoints, Capacitor assets, and signed-build docs verified.");
