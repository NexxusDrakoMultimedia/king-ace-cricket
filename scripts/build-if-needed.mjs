// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

// Run by `wrangler deploy` (see wrangler.jsonc) before it publishes the site.
//
// If the site has already been built, it does nothing. That is what happens when the
// host runs `npm run build` first, as Cloudflare Workers Builds should (Settings, Build,
// Build command), so this can never replace a build that has your analytics variables
// with one made without them.
// If nothing has built the site yet, for example because the build command was left
// blank, it builds now so the deploy doesn't fail with a missing folder.
//   KAC_FORCE_BUILD=1   build even if the site is already built
//   KAC_OUT             output folder (default: dist)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = (process.env.KAC_OUT ?? "").trim() || "dist";
const force = (process.env.KAC_FORCE_BUILD ?? "").trim() !== "";

if (!force && existsSync(join(out, "index.html"))) {
  console.log(`${out}/ is already built, so I'm not building again.`);
} else {
  console.log(`${out}/ hasn't been built, so I'm building it now. (Set the host's build command to "npm run build" to build before deploying.)`);
  const build = join(dirname(fileURLToPath(import.meta.url)), "build.mjs");
  const result = spawnSync(process.execPath, [build], { stdio: "inherit", env: process.env });
  process.exit(result.status ?? 1);
}
