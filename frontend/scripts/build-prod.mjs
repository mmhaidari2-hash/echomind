import { spawn } from "node:child_process";

process.env.NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || ".next-prod";
process.env.NODE_ENV = "production";

const child = spawn("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
