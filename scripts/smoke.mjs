#!/usr/bin/env node
/**
 * Bundles test/smoke.jsx and renders every screen.
 *
 * Static analysis has repeatedly passed on code that crashed the moment it
 * rendered — a linter can't tell that an occurrence was handed to something
 * expecting a class row. Rendering can.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "node_modules", ".cache");

const suites = [
  ["test/smoke.jsx", "rollcall-smoke.cjs"],   // every screen renders
  ["test/logic.mjs", "rollcall-logic.cjs"],   // data layer under bad input
];

for (const [entry, name] of suites) {
  const out = path.join(cache, name);
  await runSuite(entry, out);
}

async function runSuite(entry, out) {
await build({
  entryPoints: [path.join(root, entry)],
  bundle: true,
  outfile: out,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  logLevel: "error",
  // The real values never reach this process; the client just needs a
  // well-formed URL to construct without throwing.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '"https://smoke.supabase.co"',
    "import.meta.env.VITE_SUPABASE_ANON_KEY": '"smoke"',
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": '"smoke"',
  },
});

try {
  execFileSync(process.execPath, [out], { stdio: "inherit" });
} catch {
  process.exit(1);
}
}
