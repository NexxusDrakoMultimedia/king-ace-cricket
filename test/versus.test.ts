// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/innings.ts";
import { inningsSummary, newVersusMatch, parseMatch, starterTeams, totalBalls, versusResult } from "../src/match.ts";
import type { MatchRecord } from "../src/match.ts";
import { playTeamMatch } from "../src/teamMatch.ts";

const NOW = new Date("2026-11-22T10:00:00Z");
const [alpha, omega] = starterTeams();

test("the starter teams are Alpha XI and Omega XI, One to Eleven", () => {
  assert.equal(alpha.name, "Alpha XI");
  assert.equal(omega.name, "Omega XI");
  assert.equal(alpha.players[0], "Alpha One");
  assert.equal(alpha.players[10], "Alpha Eleven");
  assert.equal(omega.players[0], "Omega One");
  assert.equal(omega.players[10], "Omega Eleven");
  assert.equal(new Set([...alpha.players, ...omega.players]).size, 22);
  assert.notEqual(alpha.id, omega.id);
  assert.deepEqual(starterTeams(), [alpha, omega], "the same every time");
});

test("a 1v1 match plays exactly as a competition match with the same seed, and the sides swap", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = newVersusMatch(alpha, omega, seed, DEFAULT_CONFIG, { now: NOW });
    const played = playTeamMatch(alpha, omega, seed, DEFAULT_CONFIG, { strength: false, knockout: false }, true);
    assert.equal(m.mode, "versus");
    assert.equal(m.innings.length, 2);
    const [a, b] = m.innings;
    assert.equal(a!.battingTeam.id, played.result.innings[0].teamId);
    assert.equal(a!.bowlingTeam!.id, b!.battingTeam.id);
    assert.equal(b!.bowlingTeam!.id, a!.battingTeam.id);
    assert.deepEqual(a!.log, played.logs![0]);
    assert.deepEqual(b!.log, played.logs![1]);
    assert.equal(versusResult(m), null, "no result until every ball is shown");
    m.progress = totalBalls(m);
    const r = versusResult(m)!;
    assert.equal(r.winner, played.result.winner);
    assert.equal(r.margin, played.result.margin);
    const s1 = inningsSummary(a!.battingTeam, a!.log, m.config);
    assert.equal(s1.runs, played.result.innings[0].runs);
  }
});

test("a 1v1 match needs two different teams, and strength is passed on", () => {
  assert.throws(() => newVersusMatch(alpha, alpha, 1), /two different teams/);
  const strong = { ...alpha, strength: 5 };
  const m = newVersusMatch(strong, omega, 7, DEFAULT_CONFIG, { strength: true, now: NOW });
  assert.equal(m.strength, true);
  const played = playTeamMatch(strong, omega, 7, DEFAULT_CONFIG, { strength: true, knockout: false }, true);
  assert.deepEqual(m.innings[0]!.log, played.logs![0]);
});

test("1v1 matches round-trip through JSON, and bad ones are rejected", () => {
  const m = newVersusMatch(alpha, omega, 12, DEFAULT_CONFIG, { now: NOW });
  m.progress = 30;
  assert.deepEqual(parseMatch(JSON.parse(JSON.stringify(m))), m);
  const bad = (mutate: (x: MatchRecord & Record<string, unknown>) => void): unknown => {
    const c = structuredClone(m) as MatchRecord & Record<string, unknown>;
    mutate(c);
    return parseMatch(JSON.parse(JSON.stringify(c)));
  };
  assert.equal(bad((c) => { c.progress = totalBalls(m) + 1; }), null, "progress past the end");
  assert.equal(bad((c) => { c.innings.length = 1; }), null, "a versus match has two innings");
  assert.equal(bad((c) => { delete c.innings[0]!.bowlingTeam; }), null, "and both have a fielding side");
  assert.equal(bad((c) => { c.innings[0]!.bowlingTeam = c.innings[0]!.battingTeam; }), null, "a side can't field against itself");
  assert.equal(bad((c) => { c.innings[1]!.battingTeam = { ...c.innings[1]!.battingTeam, id: "someone-else" }; }), null, "the sides must swap");
  assert.equal(bad((c) => { c.strength = "yes" as unknown as boolean; }), null);
  assert.equal(bad((c) => { c.mode = "two-player" as "versus"; }), null);
  // A single innings still has exactly one.
  assert.equal(bad((c) => { c.mode = "solo"; }), null);
});
