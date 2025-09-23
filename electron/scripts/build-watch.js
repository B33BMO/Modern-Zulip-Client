import { context } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const outdir = path.resolve(".electron/dist");
await mkdir(outdir, { recursive: true });

const common = {
  platform: "node",
  bundle: true,
  sourcemap: true,
  format: "cjs",
  // ⬇️ Do not bundle native deps
  external: ["electron", "keytar"],
  target: ["node18"],
};

const ctxMain = await context({
  entryPoints: ["electron/main.ts"],
  outfile: path.join(outdir, "main.cjs"),
  ...common,
});
const ctxPreload = await context({
  entryPoints: ["electron/preload.ts"],
  outfile: path.join(outdir, "preload.cjs"),
  ...common,
});

await ctxMain.watch();
await ctxPreload.watch();
console.log("Watching Electron sources…");
