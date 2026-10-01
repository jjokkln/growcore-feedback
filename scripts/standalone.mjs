// Baut die eigenständige Fassung: standalone/gcf.js, ein Skript mit React, Overlay und Stil.
// Liegt im Repo (nicht in dist/), damit ein Einbau ohne eigenen Build-Schritt sie ausliefern kann.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const hier = (pfad) => fileURLToPath(new URL(pfad, import.meta.url));

await build({
  entryPoints: [hier("../src/standalone/index.tsx")],
  outfile: hier("../standalone/gcf.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  loader: { ".css": "text" },
  alias: { "next/navigation": hier("../src/standalone/navigation.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "warning",
});
console.log("standalone/gcf.js gebaut");
