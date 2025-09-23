import { build } from "esbuild";
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

await Promise.all([
  build({
    entryPoints: ["electron/main.ts"],
    outfile: path.join(outdir, "main.cjs"),
    ...common,
  }),
  build({
    entryPoints: ["electron/preload.ts"],
    outfile: path.join(outdir, "preload.cjs"),
    ...common,
  }),
]);
console.log("Built main & preload to", outdir);
