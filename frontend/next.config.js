/** @type {import('next').NextConfig} */
const isStaticExport =
  process.env.CAPACITOR_BUILD === "1" || process.env.NEXT_OUTPUT === "export";
const isStandalone =
  process.env.NEXT_OUTPUT === "standalone" || process.env.DOCKER_BUILD === "1";
const isVercel = process.env.VERCEL === "1";

/**
 * FastAPI origin (no trailing /api/v1).
 * Set one of these on Vercel to the Railway public URL:
 *   NEXT_PUBLIC_API_URL=https://<service>.up.railway.app/api/v1
 *   API_PROXY_TARGET=https://<service>.up.railway.app
 *   RAILWAY_API_URL=https://<service>.up.railway.app
 */
function envApiOrigin() {
  const values = [
    process.env.API_PROXY_TARGET,
    process.env.INTERNAL_API_URL,
    process.env.RAILWAY_API_URL,
    process.env.NEXT_PUBLIC_API_URL,
  ];
  for (const value of values) {
    const raw = (value || "").trim();
    if (!raw || raw.startsWith("/")) continue;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withProtocol.replace(/\/$/, "").replace(/\/api\/v1$/i, "");
  }
  return "";
}

function apiV1Rewrites(origin) {
  // Explicit prefixes only so /api/v1/chat (and other backend routes) proxy
  // to Railway, while /api/v1/travel stays on Next.js
  // (app/api/v1/travel/intent) and is forwarded from that route.
  const prefixes = [
    "health",
    "ready",
    "chat",
    "process",
    "delay-repay/:path*",
    "consumer-rights/:path*",
    "overdraft-shield/:path*",
    "documents/:path*",
    "notifications/:path*",
    "memory/:path*",
  ];
  return [
    { source: "/api/v1", destination: `${origin}/api/v1` },
    { source: "/api/v1/", destination: `${origin}/api/v1/` },
    ...prefixes.map((prefix) => ({
      source: `/api/v1/${prefix}`,
      destination: `${origin}/api/v1/${prefix}`,
    })),
  ];
}

const apiOrigin = envApiOrigin();

if (isVercel && !apiOrigin) {
  throw new Error(
    "Vercel build is missing a Railway API URL. Set NEXT_PUBLIC_API_URL or API_PROXY_TARGET to https://<service>.up.railway.app/api/v1",
  );
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Vercel: default serverless. Docker: NEXT_OUTPUT=standalone. Capacitor: export.
  ...(isStaticExport
    ? { output: "export" }
    : isStandalone
      ? { output: "standalone" }
      : {}),
  distDir: process.env.NEXT_DIST_DIR || ".next",
  trailingSlash: isStaticExport,
  images: {
    unoptimized: true,
  },
};

if (!isStaticExport) {
  nextConfig.headers = async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.json",
      headers: [{ key: "Cache-Control", value: "no-cache" }],
    },
  ];

  nextConfig.rewrites = async () => {
    const origin = apiOrigin || "http://127.0.0.1:8000";
    const rules = apiV1Rewrites(origin);
    // beforeFiles: proxy /api/v1/* before Next looks for app/api route handlers.
    // Without this, Vercel 404s same-origin API calls instead of reaching Railway.
    return {
      beforeFiles: rules,
      afterFiles: [],
      fallback: [],
    };
  };
}

module.exports = nextConfig;
