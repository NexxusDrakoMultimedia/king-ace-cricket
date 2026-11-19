// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// Prints one version's section of CHANGELOG.md (used for GitHub Release notes).
//   node scripts/changelog-section.mjs 0.1.0
import { readFileSync } from "node:fs";

/** The text under "## [version]" up to the next "## " heading, or null if there is no such section. */
export function changelogSection(markdown, version) {
  const lines = markdown.split("\n");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((l) => new RegExp(`^## \\[${escaped}\\]( - .*)?\\s*$`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim() + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  if (!version) {
    console.error("Usage: node scripts/changelog-section.mjs <version>");
    process.exit(2);
  }
  const section = changelogSection(readFileSync("CHANGELOG.md", "utf8"), version);
  if (!section) {
    console.error(`CHANGELOG.md has no section for [${version}]. Rename [Unreleased] when you cut the release.`);
    process.exit(1);
  }
  process.stdout.write(section);
}
