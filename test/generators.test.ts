// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTeams } from "../src/names.ts";
import { buildExport, parseImport } from "../src/exchange.ts";
import { createCompetition, simulateAll } from "../src/competition.ts";
import { makeRng } from "../src/rng.ts";
import { clampStrength, normaliseTeam, parseTeam, makeTeam } from "../src/match.ts";

test("generateTeams: distinct names and ids, strength 0-5, deterministic, respects taken names", () => {
  const ts = generateTeams(makeRng(5), 16);
  assert.equal(ts.length, 16);
  assert.equal(new Set(ts.map((t) => t.name)).size, 16);
  assert.equal(new Set(ts.map((t) => t.id)).size, 16);
  for (const t of ts) {
    assert.ok(Number.isInteger(t.strength) && t.strength! >= 0 && t.strength! <= 5);
    assert.equal(t.players.length, 11);
  }
  assert.deepEqual(generateTeams(makeRng(5), 16), ts);
  const taken = new Set(ts.slice(0, 5).map((t) => t.name));
  const more = generateTeams(makeRng(5), 16, taken);
  assert.ok(more.every((t) => !taken.has(t.name)));
  assert.ok(new Set(generateTeams(makeRng(1), 400).map((t) => t.strength)).size === 6, "all strengths occur");
});

test("team strength is clamped and survives save/load", () => {
  assert.equal(clampStrength(9), 5);
  assert.equal(clampStrength(-3), 0);
  assert.equal(clampStrength(2.6), 3);
  assert.equal(clampStrength("4"), 0);
  assert.equal(clampStrength(undefined), 0);
  assert.equal(normaliseTeam({ id: "x", name: "T", players: [] }).strength, 0);
  const t = makeTeam("T", [], "x", 4);
  assert.equal(parseTeam(JSON.parse(JSON.stringify(t)))!.strength, 4);
  assert.equal(parseTeam({ id: "x", name: "Old team", players: [] })!.strength, 0, "teams saved before strength existed load as 0");
});

test("competitions export and import with matches and teams", () => {
  const comp = createCompetition({ name: "Cup", kind: "cup", teams: generateTeams(makeRng(2), 6), seed: 2 });
  simulateAll(comp);
  const bundle = buildExport([], [], new Date(), [comp]);
  const r = parseImport(JSON.stringify(bundle));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.competitions, [comp]);
  assert.deepEqual(parseImport(JSON.stringify(comp)).competitions, [comp]);
  const hurt = JSON.parse(JSON.stringify(bundle));
  hurt.competitions[0].fixtures[0].a = "nobody";
  const r2 = parseImport(JSON.stringify(hurt));
  assert.equal(r2.competitions.length, 0);
  assert.equal(r2.skipped, 1);
});

test("files from before league systems were removed still import, without the systems", () => {
  const t = generateTeams(makeRng(4), 3);
  const old = { format: "king-ace-cricket", version: 1, exportedAt: "2026-11-19T10:00:00.000Z", matches: [], teams: t, competitions: [], systems: [{ id: "s-1", seasons: [] }] };
  const r = parseImport(JSON.stringify(old));
  assert.equal(r.error, undefined);
  assert.deepEqual(r.teams, t);
  assert.equal("systems" in r, false);
  assert.match(parseImport(JSON.stringify({ id: "s-1", teams: t, seasons: [] })).error ?? "", /no longer part of the game/);
});
