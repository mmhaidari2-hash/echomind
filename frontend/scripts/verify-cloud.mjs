import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = join(frontend, "..");

function read(path) {
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  return readFileSync(path, "utf8");
}

const nextConfig = read(join(frontend, "next.config.js"));
if (!nextConfig.includes("NEXT_OUTPUT") || !nextConfig.includes("standalone")) {
  throw new Error("next.config.js must keep Docker standalone behind NEXT_OUTPUT");
}
if (nextConfig.includes('output: isStaticExport ? "export" : "standalone"')) {
  throw new Error("next.config.js must not force standalone on Vercel");
}
if (
  !nextConfig.includes("rewrites") ||
  !nextConfig.includes("/api/v1/chat") ||
  !nextConfig.includes("/api/v1/travel") ||
  !nextConfig.includes("beforeFiles") ||
  !nextConfig.includes("NEXT_PUBLIC_API_URL") ||
  !nextConfig.includes("API_PROXY_TARGET")
) {
  throw new Error("next.config.js must rewrite backend /api/v1 prefixes and keep /api/v1/travel on Next.js");
}

const api = read(join(frontend, "src", "services", "api.ts"));
if (!api.includes("NEXT_PUBLIC_API_URL")) {
  throw new Error("api.ts must read NEXT_PUBLIC_API_URL");
}
if (!api.includes('process.env.NODE_ENV === "production"')) {
  throw new Error("api.ts must skip localhost fallbacks in production");
}

const dockerfile = read(join(repo, "backend", "Dockerfile"));
if (!dockerfile.includes("${PORT:-8000}")) {
  throw new Error("backend/Dockerfile must honor $PORT for Railway/Render");
}

for (const relative of [
  "frontend/vercel.json",
  "frontend/.env.production.example",
  "backend/nixpacks.toml",
  "backend/Procfile",
  "backend/.env.production.example",
  "render.yaml",
  "DEPLOY.md",
]) {
  read(join(repo, relative));
}

if (!read(join(frontend, ".env.production.example")).includes("NEXT_PUBLIC_API_URL")) {
  throw new Error("frontend/.env.production.example must define NEXT_PUBLIC_API_URL");
}

console.log("Vercel + Railway/Render production mapping verified.");
