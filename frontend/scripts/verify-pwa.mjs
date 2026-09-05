import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "public", "manifest.json");
const swPath = join(root, "public", "sw.js");
const offlinePath = join(root, "public", "offline.html");

for (const path of [manifestPath, swPath, offlinePath]) {
  if (!existsSync(path)) {
    throw new Error(`Missing PWA file: ${path}`);
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const required = {
  name: "EchoMind",
  short_name: "EchoMind",
  display: "standalone",
  background_color: "#090d16",
  theme_color: "#090d16",
  start_url: "/",
};

for (const [key, value] of Object.entries(required)) {
  if (manifest[key] !== value) {
    throw new Error(`manifest.json ${key} must be ${value}`);
  }
}

if (!manifest.icons?.some((icon) => icon.src === "/icon.png" && icon.sizes === "192x192")) {
  throw new Error("manifest.json needs a 192x192 /icon.png entry");
}

const sw = readFileSync(swPath, "utf8");
for (const token of ["echomind-shell", "offline.html", "/api/", "skipWaiting", "clients.claim"]) {
  if (!sw.includes(token)) {
    throw new Error(`sw.js is missing required strategy token: ${token}`);
  }
}

if (!sw.includes("network") && !sw.includes("Network")) {
  throw new Error("sw.js must document a network-first navigation strategy");
}

console.log("PWA manifest, service worker, and offline fallback verified.");
