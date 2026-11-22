// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompetition, simulateAll } from "../src/competition.ts";
import { BOARD_SIZE, buildLeaderboards } from "../src/leaderboards.ts";
import { generateTeams } from "../src/names.ts";
import { buildProfiles } from "../src/profiles.ts";
import { makeRng } from "../src/rng.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const world = () => {
  const a = createCompetition({ name: "League", kind: "league", teams: generateTeams(makeRng(3), 8), seed: 3, now: NOW, settings: { rounds: 2, playoffSpots: 4, bestOf: 3, finalBestOf: 3 } });
  const b = createCompetition({ name: "Cup", kind: "cup", teams: generateTeams(makeRng(9), 12), seed: 9, now: new Date(NOW.getTime() + 1000) });
  simulateAll(a, NOW);
  simulateAll(b, NOW);
  return [a, b];
};

test("bowling figures add up to the innings they came from", () => {
  const comps = world();
  const p = buildProfiles(comps);
  const games = comps.flatMap((c) => c.fixtures.filter((f) => f.result));
  assert.ok(p.matches.length >= games.length, "a series counts every game");
  const runs = p.matches.reduce((n, m) => n + m.innings[0].runs + m.innings[1].runs, 0);
  const wickets = p.matches.reduce((n, m) => n + m.innings[0].wickets + m.innings[1].wickets, 0);
  const balls = p.matches.reduce((n, m) => n + m.innings[0].balls + m.innings[1].balls, 0);
  const bowl = [...p.players.values()].map((x) => x.bowling);
  assert.equal(bowl.reduce((n, b) => n + b.runs, 0), runs);
  assert.equal(bowl.reduce((n, b) => n + b.wickets, 0), wickets);
  assert.equal(bowl.reduce((n, b) => n + b.balls, 0), balls);
  assert.equal(p.bowlSpells.reduce((n, s) => n + s.wickets, 0), wickets);
});

test("every board is ranked best first, capped, and ties share a place", () => {
  const p = buildProfiles(world());
  const lb = buildLeaderboards(p);
  const all = [...lb.batting, ...lb.bowling, ...lb.teams];
  assert.ok(all.length >= 12, "most boards fill in");
  for (const b of all) {
    assert.ok(b.rows.length > 0 && b.rows.length <= BOARD_SIZE, b.id);
    let last = 0;
    b.rows.forEach((r, i) => {
      assert.equal(r.cells.length, b.columns.length, `${b.id}: a cell for every column`);
      const n = Number(r.rank.replace("=", ""));
      assert.ok(n >= last && n <= i + 1, `${b.id}: ranks only go up and never skip ahead`);
      last = n;
    });
    assert.equal(b.rows[0]!.rank.replace("=", ""), "1");
  }
});

test("the leaders match the raw numbers", () => {
  const p = buildProfiles(world());
  const lb = buildLeaderboards(p);
  const runs = lb.batting.find((b) => b.id === "runs")!;
  assert.equal(Number(runs.rows[0]!.cells[1]), Math.max(...[...p.players.values()].map((x) => x.stats.runs)));
  const high = lb.batting.find((b) => b.id === "high-scores")!;
  assert.equal(parseInt(high.rows[0]!.cells[0]!, 10), Math.max(...p.innings.map((i) => i.runs)));
  const tot = lb.teams.find((b) => b.id === "totals")!;
  assert.equal(parseInt(tot.rows[0]!.cells[0]!, 10), Math.max(...p.matches.flatMap((m) => m.innings.map((i) => i.runs))));
  const wk = lb.bowling.find((b) => b.id === "wickets")!;
  assert.equal(Number(wk.rows[0]!.cells[4]), Math.max(...[...p.players.values()].map((x) => x.bowling.wickets)));
  const big = lb.teams.find((b) => b.id === "big-wins")!;
  const margins = p.matches.filter((m) => m.winner === m.innings[0].teamId).map((m) => m.innings[0].runs - m.innings[1].runs);
  assert.equal(parseInt(big.rows[0]!.cells[0]!, 10), Math.max(...margins));
  // Qualifications hold: nobody tops the average table on one lucky innings.
  const avg = lb.batting.find((b) => b.id === "average");
  for (const r of avg?.rows ?? []) assert.ok(Number(r.cells[0]) >= 5);
  // The roll of honour lists the finished competitions.
  assert.equal(lb.honours[0]!.rows.length, 2);
});

test("an empty world has empty books, and an unfinished competition no roll of honour", () => {
  const lb = buildLeaderboards(buildProfiles([]));
  assert.deepEqual([lb.batting, lb.bowling, lb.teams, lb.honours].map((x) => x.length), [0, 0, 0, 0]);
  const c = createCompetition({ name: "Fresh", kind: "league", teams: generateTeams(makeRng(1), 4), seed: 1, now: NOW });
  assert.equal(buildLeaderboards(buildProfiles([c])).honours.length, 0);
});

test("the same results always give the same books", () => {
  const comps = world();
  assert.deepEqual(buildLeaderboards(buildProfiles(comps)), buildLeaderboards(buildProfiles(comps)));
});
