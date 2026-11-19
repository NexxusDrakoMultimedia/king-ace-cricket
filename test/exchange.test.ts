// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExport, parseImport } from "../src/exchange.ts";
import { makeTeam, newSoloMatch } from "../src/match.ts";

const team = makeTeam("Export XI", ["A", "B"], "t-export");
const match = { ...newSoloMatch(team, 21), progress: 12 };

test("export then import round-trips matches and teams", () => {
  const text = JSON.stringify(buildExport([match], [team]));
  const r = parseImport(text);
  assert.equal(r.error, undefined);
  assert.equal(r.skipped, 0);
  assert.deepEqual(r.matches, [match]);
  assert.equal(r.teams.length, 1);
  assert.equal(r.teams[0]!.name, "Export XI");
});

test("a single match, a single team, and a bare match array are accepted", () => {
  assert.equal(parseImport(JSON.stringify(match)).matches.length, 1);
  assert.equal(parseImport(JSON.stringify(team)).teams.length, 1);
  assert.equal(parseImport(JSON.stringify([match, match])).matches.length, 2);
});

test("invalid entries are skipped and counted, valid ones still import", () => {
  const text = JSON.stringify({ matches: [match, { version: 1 }, 7], teams: [team, { nope: true }] });
  const r = parseImport(text);
  assert.equal(r.matches.length, 1);
  assert.equal(r.teams.length, 1);
  assert.equal(r.skipped, 3);
  assert.equal(r.error, undefined);
});

test("garbage input gives a friendly error and never throws", () => {
  for (const text of ["not json", "42", "null", "{}", '{"matches": []}', "[]"]) {
    const r = parseImport(text);
    assert.ok(r.error, `expected an error for ${text}`);
    assert.deepEqual(r.matches, []);
  }
  assert.ok(parseImport("x".repeat(5_000_001)).error);
});

test("hostile text in names is kept as plain data (escaping happens at render time)", () => {
  const evil = makeTeam('<img src=x onerror=alert(1)>', ["<script>"], "t-evil");
  const r = parseImport(JSON.stringify({ teams: [evil] }));
  assert.equal(r.teams[0]!.name, '<img src=x onerror=alert(1)>');
});
