// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = mkdtempSync(join(tmpdir(), "kac-build-if-needed-"));
const clean = { ...process.env, KAC_OUT: join(out, "site"), KAC_GA_ID: "", KAC_GAMEANALYTICS_KEY: "", KAC_GAMEANALYTICS_SECRET: "", KAC_FORCE_BUILD: "" };
const run = (extra = {}) => execFileSync(process.execPath, ["scripts/build-if-needed.mjs"], { env: { ...clean, ...extra }, encoding: "utf8" });
after(() => rmSync(out, { recursive: true, force: true }));

test("with nothing built (a blank build command), the deploy step builds the site itself", () => {
  const log = run();
  assert.match(log, /hasn't been built/);
  assert.ok(existsSync(join(out, "site", "index.html")));
  assert.ok(existsSync(join(out, "site", "main.js")));
  assert.ok(existsSync(join(out, "site", "fonts.css")));
});

test("an existing build is left alone, so it can't replace one made with the analytics variables", () => {
  const marker = join(out, "site", "index.html");
  writeFileSync(marker, "BUILT-WITH-KEYS");
  const log = run();
  assert.match(log, /already built/);
  assert.equal(readFileSync(marker, "utf8"), "BUILT-WITH-KEYS");
});

test("KAC_FORCE_BUILD rebuilds anyway", () => {
  const marker = join(out, "site", "index.html");
  writeFileSync(marker, "STALE");
  run({ KAC_FORCE_BUILD: "1" });
  assert.notEqual(readFileSync(marker, "utf8"), "STALE");
  assert.match(readFileSync(marker, "utf8"), /King and Ace Cricket/);
});
