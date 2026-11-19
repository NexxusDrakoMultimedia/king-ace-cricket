// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changelogSection } from "../scripts/changelog-section.mjs";

const SAMPLE = `# Changelog

## [Unreleased]

### Added
- Something new.

## [1.2.0] - 2026-12-01

### Added
- A feature.

### Fixed
- A bug.

## [1.1.0] - 2026-11-01

- Older.
`;

test("a release's notes are its own section of the changelog", () => {
  const s = changelogSection(SAMPLE, "1.2.0");
  assert.match(s, /^### Added\n- A feature\./);
  assert.match(s, /### Fixed\n- A bug\.\n$/);
  assert.doesNotMatch(s, /Older|Something new/);
  assert.match(changelogSection(SAMPLE, "1.1.0"), /^- Older\.\n$/);
  assert.match(changelogSection(SAMPLE, "Unreleased"), /Something new/);
});

test("a version with no changelog section is reported, not published empty", () => {
  assert.equal(changelogSection(SAMPLE, "9.9.9"), null);
  assert.equal(changelogSection(SAMPLE, "1.2"), null, "versions match exactly");
  assert.equal(changelogSection(SAMPLE, "1.2.0.1"), null);
});

test("the real changelog is in Keep a Changelog form and package.json is valid SemVer", () => {
  const log = readFileSync("CHANGELOG.md", "utf8");
  assert.match(log, /^# Changelog/);
  assert.match(log, /^## \[Unreleased\]/m);
  assert.ok(changelogSection(log, "Unreleased"));
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/, `"${version}" is not SemVer`);
});

test("every released version in the changelog is valid SemVer and in descending order", () => {
  const versions = [...readFileSync("CHANGELOG.md", "utf8").matchAll(/^## \[(\d[^\]]*)\]/gm)].map((m) => m[1]);
  const key = (v) => v.split("-")[0].split(".").map(Number);
  for (const v of versions) assert.match(v, /^\d+\.\d+\.\d+/);
  for (let i = 1; i < versions.length; i++) {
    const [a, b] = [key(versions[i - 1]), key(versions[i])];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2]))), `${versions[i - 1]} should come after ${versions[i]}`);
  }
});
