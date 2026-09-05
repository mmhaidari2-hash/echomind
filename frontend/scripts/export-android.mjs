import { spawn } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.CAPACITOR_BUILD = "1";
process.env.NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || ".next-android";
process.env.NODE_ENV = "production";

const child = spawn("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: frontend,
});

child.on("exit", (code) => {
  if (code) {
    process.exit(code);
  }

  const outDir = join(frontend, "out");
  const distDir = join(frontend, process.env.NEXT_DIST_DIR);
  if (existsSync(join(distDir, "_next"))) {
    rmSync(outDir, { recursive: true, force: true });
    cpSync(distDir, outDir, { recursive: true });
  }
  if (!existsSync(join(outDir, "index.html")) || !existsSync(join(outDir, "_next"))) {
    console.error("Android export did not produce static assets in frontend/out");
    process.exit(1);
  }
  console.log("Static Android export is ready in frontend/out");
  process.exit(0);
});
