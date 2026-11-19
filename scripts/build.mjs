// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// Builds the static site into dist/. Everything is relative-pathed, so dist/ can
// be served from the root of any host (for example a subdomain).
//   node scripts/build.mjs           production build (minified)
//   node scripts/build.mjs --serve   dev server on http://localhost:8080 with rebuild on change
//
// Analytics is configured by build-time variables (in Cloudflare Workers Builds, under
// Settings > Build > Variables and secrets). With none set there is no analytics code,
// no cookie banner, and the strictest Content-Security-Policy.
//   KAC_GA_ID                  Google Analytics 4 measurement ID, like G-XXXXXXXXXX
//   KAC_GAMEANALYTICS_KEY      GameAnalytics game key
//   KAC_GAMEANALYTICS_SECRET   GameAnalytics secret key (the web SDK needs it in the page)
//   KAC_OUT                    output folder (default: dist)
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync } from "node:fs";

const serve = process.argv.includes("--serve");
const out = (process.env.KAC_OUT ?? "").trim() || "dist";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const env = (name) => (process.env[name] ?? "").trim();
const keyLike = /^[A-Za-z0-9]{16,64}$/;
let gaId = env("KAC_GA_ID");
let gaKey = env("KAC_GAMEANALYTICS_KEY");
let gaSecret = env("KAC_GAMEANALYTICS_SECRET");
if (gaId && !/^G-[A-Z0-9]{4,16}$/.test(gaId)) {
  console.warn("WARNING: KAC_GA_ID is set but is not a GA4 measurement ID (G-XXXXXXXXXX). Google Analytics is disabled.");
  gaId = "";
}
if ((gaKey || gaSecret) && !(keyLike.test(gaKey) && keyLike.test(gaSecret))) {
  console.warn("WARNING: KAC_GAMEANALYTICS_KEY and KAC_GAMEANALYTICS_SECRET must both be set and look like GameAnalytics keys. GameAnalytics is disabled.");
  gaKey = "";
  gaSecret = "";
}
const gameAnalytics = gaKey && gaSecret ? { key: gaKey, secret: gaSecret } : null;
// Report only whether each provider is on, never the keys, because build logs can be shared.
console.log(`Analytics: Google Analytics ${gaId ? "on" : "off"}, GameAnalytics ${gameAnalytics ? "on" : "off"}`);

/** The Content-Security-Policy only names a provider's domains when that provider is configured. */
function headers() {
  const connect = [
    gaId ? " https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com" : "",
    gameAnalytics ? " https://api.gameanalytics.com" : "",
  ].join("");
  return readFileSync("web/_headers", "utf8")
    .replace("{{SCRIPT}}", gaId ? " https://www.googletagmanager.com" : "")
    .replace("{{CONNECT}}", connect)
    .replace("{{IMG}}", gaId ? " https://*.google-analytics.com https://*.googletagmanager.com" : "");
}

const copyStatic = () => {
  mkdirSync(out, { recursive: true });
  cpSync("web/index.html", `${out}/index.html`);
  cpSync("web/fonts.css", `${out}/fonts.css`);
  cpSync("web/fonts", `${out}/fonts`, { recursive: true }); // self-hosted brand fonts
  cpSync("web/tokens.css", `${out}/tokens.css`);
  cpSync("web/style.css", `${out}/style.css`);
  writeFileSync(`${out}/_headers`, headers());
};
if (!serve) rmSync(out, { recursive: true, force: true }); // no stale files in a deploy
copyStatic();

const options = {
  entryPoints: { main: "web/main.ts" },
  bundle: true,
  outdir: out,
  // The GameAnalytics SDK is a separate chunk, fetched only after a visitor accepts it.
  splitting: true,
  chunkNames: "chunk-[hash]",
  format: "esm",
  target: "es2022",
  sourcemap: serve, // source maps only for local development, not the deployed site
  minify: !serve,
  logLevel: "info",
  define: {
    __KAC_GA_ID__: JSON.stringify(gaId),
    __KAC_GAMEANALYTICS__: JSON.stringify(gameAnalytics),
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
  },
};

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  watch("web", { recursive: false }, (_event, name) => {
    if (["index.html", "style.css", "tokens.css", "fonts.css", "_headers"].includes(name ?? "")) copyStatic();
  });
  const { port } = await ctx.serve({ servedir: out, port: 8080 });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await esbuild.build(options);
}
