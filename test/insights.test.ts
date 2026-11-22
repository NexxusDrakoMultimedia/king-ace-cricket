// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompetition, replayFixture, simulateAll, simulateNext } from "../src/competition.ts";
import { bracketRounds, competitionInsights, eloSeries, inningsShape, matchHistory, pointsRace, ratedGames } from "../src/insights.ts";
import { generateTeams } from "../src/names.ts";
import { computeRatings, START_RATING } from "../src/ratings.ts";
import { makeRng } from "../src/rng.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const make = (kind: "league" | "cup" | "groups", n: number, seed = 7, settings = {}) =>
  createCompetition({ name: "T", kind, teams: generateTeams(makeRng(seed), n), seed, now: new Date(NOW.getTime() + seed), settings });

test("an innings shape adds up: balls, runs, wickets and the ball mix", () => {
  const c = make("league", 4);
  simulateAll(c, NOW);
  for (const f of c.fixtures.slice(0, 6)) {
    const { played } = replayFixture(c, f);
    played.logs!.forEach((log, i) => {
      const s = inningsShape(log);
      const inn = played.result.innings[i]!;
      assert.equal(s.runs, inn.runs);
      assert.equal(s.wickets, inn.wickets);
      assert.equal(s.balls, inn.balls);
      assert.equal(s.cumulative.length, s.balls + 1);
      assert.equal(s.cumulative.at(-1), s.runs);
      assert.equal(s.overs.reduce((n, o) => n + o.runs, 0), s.runs);
      assert.equal(s.overs.reduce((n, o) => n + o.wickets, 0), s.wickets);
      assert.equal(Object.values(s.mix).reduce((n, x) => n + x, 0), s.balls);
      assert.equal(s.wicketsAt.length, s.wickets);
      assert.ok(s.cumulative.every((v, k, a) => k === 0 || v >= a[k - 1]!), "the worm never goes down");
    });
  }
});

test("competition insights agree with the results", () => {
  const c = make("league", 6);
  simulateAll(c, NOW);
  const s = competitionInsights(c);
  assert.equal(s.played, c.fixtures.length);
  assert.equal(s.chaseWins + s.defendWins + s.ties, s.played);
  assert.equal(s.histogram.reduce((n, h) => n + h.count, 0), s.played * 2);
  assert.equal(s.chase.length, s.played);
  const totals = c.fixtures.flatMap((f) => f.result!.innings.map((i) => i.runs));
  assert.equal(s.highest!.runs, Math.max(...totals));
  assert.equal(s.lowest!.runs, Math.min(...totals));
  assert.equal(competitionInsights(make("league", 4)).played, 0);
});

test("the points race ends on the table's points", () => {
  const c = make("league", 6);
  simulateAll(c, NOW);
  const race = pointsRace(c, 6);
  assert.equal(race.series.length, 6);
  for (const s of race.series) {
    assert.equal(s.points[0], 0);
    assert.equal(s.points.length, race.rounds.length + 1);
    assert.ok(s.points.every((v, i, a) => i === 0 || v >= a[i - 1]!));
  }
  const total = race.series.reduce((n, s) => n + s.points.at(-1)!, 0);
  const expected = c.fixtures.reduce((n, f) => n + (f.result!.winner === null ? 2 * c.settings.pointsTie : c.settings.pointsWin), 0);
  assert.equal(total, expected);
});

test("a bracket has a place for every tie, byes included, and the winners follow it", () => {
  const c = make("cup", 6); // 6 teams: size 8, two byes
  const before = bracketRounds(c)!;
  assert.deepEqual(before.map((r) => r.title), ["Quarter-finals", "Semi-finals", "Final"]);
  assert.deepEqual(before.map((r) => r.ties.length), [4, 2, 1]);
  assert.equal(before[0]!.ties.filter((t) => t.bye).length, 2);
  assert.ok(before[1]!.ties.every((t) => t.fixtureId === null && t.a === null), "later rounds wait to be drawn");
  simulateAll(c, NOW);
  const after = bracketRounds(c)!;
  assert.deepEqual(after.map((r) => r.ties.length), [4, 2, 1]);
  const final = after[2]!.ties[0]!;
  assert.ok(final.fixtureId !== null && final.winner);
  assert.equal(final.winner, c.fixtures.find((f) => f.stage === "final")!.result!.winner);
  // Each later tie's teams are the winners of the two ties that feed it.
  for (let r = 1; r < after.length; r++) {
    after[r]!.ties.forEach((t, j) => {
      const feeders = [after[r - 1]!.ties[2 * j]!, after[r - 1]!.ties[2 * j + 1]!];
      assert.deepEqual([t.a, t.b], feeders.map((x) => x.winner));
    });
  }
});

test("no bracket for a league without playoffs, and none until the group stage ends", () => {
  assert.equal(bracketRounds(make("league", 4)), null);
  const major = make("league", 6, 3, { playoffSpots: 4 });
  assert.equal(bracketRounds(major), null);
  simulateAll(major, NOW);
  assert.deepEqual(bracketRounds(major)!.map((r) => r.title), ["Semi-finals", "Final"]);
  const worlds = make("groups", 8, 5, { groupSize: 4, groupAdvance: 2 });
  assert.equal(bracketRounds(worlds), null);
  simulateNext(worlds, NOW);
  assert.equal(bracketRounds(worlds), null);
  simulateAll(worlds, NOW);
  assert.ok(bracketRounds(worlds)!.length >= 2);
});

test("Elo history matches the ratings and replays the same way every time", () => {
  const a = make("league", 6, 11);
  const b = make("cup", 8, 12);
  simulateAll(a, NOW);
  simulateAll(b, NOW);
  const comps = [a, b];
  const hist = matchHistory(comps);
  for (const row of computeRatings(comps)) {
    const h = hist.get(row.teamId) ?? [];
    assert.equal(h.length, row.played);
    assert.equal(h.filter((e) => e.result === "W").length, row.won);
    assert.equal(h.filter((e) => e.result === "L").length, row.lost);
    assert.ok(Math.abs((h.at(-1)?.eloAfter ?? START_RATING) - row.elo) < 1e-9, "history ends on the current Elo");
    assert.equal(eloSeries(h).length, h.length + 1);
    h.forEach((e, i) => {
      assert.equal(e.n, i + 1);
      if (i > 0) assert.equal(e.eloBefore, h[i - 1]!.eloAfter, "each game starts where the last ended");
    });
  }
  assert.deepEqual(matchHistory(comps), hist);
  // Every game moves the two teams' Elo by equal and opposite amounts.
  for (const g of ratedGames(comps)) assert.ok(Math.abs(g.aAfter - g.aBefore + (g.bAfter - g.bBefore)) < 1e-9);
});
