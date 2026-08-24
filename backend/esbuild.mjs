import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/app.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  sourcemap: true,
  outfile: "dist/app.js",
});
