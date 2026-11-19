// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allCompetitions, createSystem, currentSeason, ensurePlayoffs, isSeasonComplete, parseLeagueSystem, seasonOutcome,
  simulateSeason, simulateSeasonRound, startNextSeason, systemTeams, tierTable,
} from "../src/leagueSystem.ts";
import type { LeagueSystem } from "../src/leagueSystem.ts";
import { champion, createCompetition, simulateAll } from "../src/competition.ts";
import { computeRatings } from "../src/ratings.ts";
import { generateTeams } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const tiersOf = (sizes: number[], seed = 1) => {
  const all = generateTeams(makeRng(seed), sizes.reduce((a, b) => a + b, 0));
  let i = 0;
  return sizes.map((n) => all.slice(i, (i += n)));
};
const system = (sizes = [8, 8, 8], settings: Parameters<typeof createSystem>[0]["settings"] = {}, seed = 3) =>
  createSystem({ name: "Pyramid", tiers: tiersOf(sizes, seed), seed, now: NOW, settings });
const idsByTier = (sys: LeagueSystem) => currentSeason(sys).tiers.map((c) => c.teams.map((t) => t.id).sort());

test("creating a system validates tiers, sizes and spots", () => {
  assert.throws(() => createSystem({ name: "x", tiers: tiersOf([8]), seed: 1 }), /2 to 8 tiers/);
  assert.throws(() => createSystem({ name: "x", tiers: tiersOf([17, 8]), seed: 1 }), /at most 16/);
  assert.throws(() => createSystem({ name: "x", tiers: tiersOf([6, 6]), seed: 1, settings: { promotionSpots: 3 } }), /at least 8/);
  assert.throws(() => createSystem({ name: "x", tiers: tiersOf([8, 8]), seed: 1, settings: { promotionSpots: 0 } }), /between 1 and 7/);
  const t = tiersOf([6, 6]);
  assert.throws(() => createSystem({ name: "x", tiers: [t[0]!, [...t[1]!.slice(1), t[0]![0]!]], seed: 1 }), /more than one tier/);
  const sys = system();
  assert.deepEqual(sys.tierNames, ["Division 1", "Division 2", "Division 3"]);
  assert.equal(sys.seasons.length, 1);
  assert.equal(currentSeason(sys).tiers.length, 3);
  assert.equal(createSystem({ name: "x", tiers: tiersOf([8, 8]), tierNames: ["Premier", " "], seed: 1 }).tierNames[1], "Division 2");
});

test("promotion and relegation: the top of a tier goes up, the bottom goes down, sizes hold", () => {
  const sys = system([8, 8, 8], { promotionSpots: 2 });
  assert.equal(simulateSeason(sys, NOW), 3 * 56);
  assert.ok(isSeasonComplete(sys));
  const before = currentSeason(sys).tiers.map(tierTable);
  const outcome = seasonOutcome(sys);
  assert.deepEqual(outcome.promoted[0], before[1]!.slice(0, 2));
  assert.deepEqual(outcome.relegated[0], before[0]!.slice(-2));
  assert.deepEqual(outcome.promoted[1], before[2]!.slice(0, 2));
  assert.deepEqual(outcome.relegated[1], before[1]!.slice(-2));

  const s2 = startNextSeason(sys, new Date(NOW.getTime() + 1000));
  assert.equal(s2.number, 2);
  assert.deepEqual(sys.seasons[0]!.outcome, outcome);
  const after = s2.tiers.map((c) => new Set(c.teams.map((t) => t.id)));
  assert.deepEqual(after.map((s) => s.size), [8, 8, 8]);
  // Champions' tier, promoted and relegated teams landed where they should.
  for (const id of before[1]!.slice(0, 2)) assert.ok(after[0]!.has(id), "promoted into tier 1");
  for (const id of before[0]!.slice(-2)) assert.ok(after[1]!.has(id), "relegated into tier 2");
  for (const id of before[2]!.slice(0, 2)) assert.ok(after[1]!.has(id));
  for (const id of before[1]!.slice(-2)) assert.ok(after[2]!.has(id));
  for (const id of before[0]!.slice(0, 6)) assert.ok(after[0]!.has(id), "safe teams stay");
  // Every team is in exactly one tier.
  assert.equal(new Set(after.flatMap((s) => [...s])).size, 24);
  assert.deepEqual(s2.tiers.map((c) => c.id), s2.tiers.map((_, t) => `${sys.id}-s002-t${t}`));
});

test("a season cannot be closed early, and a finished one is not replayed", () => {
  const sys = system();
  assert.throws(() => startNextSeason(sys, NOW), /Finish the season/);
  simulateSeason(sys, NOW);
  assert.equal(simulateSeasonRound(sys, NOW), 0, "nothing left to play");
  startNextSeason(sys, NOW);
  assert.equal(currentSeason(sys).tiers[0]!.fixtures.every((f) => !f.result), true);
});

test("pro/rel playoffs: created when the leagues finish, one extra place per boundary", () => {
  const sys = system([8, 8, 8], { promotionSpots: 2, playoffs: true });
  const season = currentSeason(sys);
  // Play the leagues only.
  while (!season.tiers.every((c) => c.fixtures.every((f) => f.result))) simulateSeasonRound(sys, NOW);
  assert.equal(season.playoffs.length, 2, "one playoff per boundary");
  assert.equal(isSeasonComplete(sys), false, "playoffs still to play");
  assert.throws(() => startNextSeason(sys, NOW));
  const tables = season.tiers.map(tierTable);
  season.playoffs.forEach((p, i) => {
    // 3rd-from-bottom of the upper tier v 3rd place of the lower tier.
    assert.deepEqual(new Set([p.fixtures[0]!.a, p.fixtures[0]!.b]), new Set([tables[i]![8 - 2 - 1], tables[i + 1]![2]]));
    assert.equal(p.fixtures[0]!.label, "Promotion/relegation playoff");
  });
  assert.equal(ensurePlayoffs(sys, NOW), false, "not created twice");
  simulateSeason(sys, NOW);
  assert.ok(isSeasonComplete(sys));
  const o = seasonOutcome(sys);
  o.promoted.forEach((up, i) => assert.ok(up.length === 2 || up.length === 3));
  o.promoted.forEach((up, i) => assert.equal(up.length, o.relegated[i]!.length), "equal numbers swap");
  const winnerLower = season.playoffs.map((p, i) => champion(p) === tables[i + 1]![2]);
  o.promoted.forEach((up, i) => assert.equal(up.length, winnerLower[i] ? 3 : 2));
  startNextSeason(sys, NOW);
  assert.deepEqual(currentSeason(sys).tiers.map((c) => c.teams.length), [8, 8, 8]);
});

test("a long run of seasons keeps every team somewhere, and strength sorts the pyramid", () => {
  const sys = system([8, 8, 8], { promotionSpots: 2, playoffs: true, strength: true }, 11);
  const everyone = sys.teams.map((t) => t.id).sort();
  for (let s = 0; s < 10; s++) {
    simulateSeason(sys, new Date(NOW.getTime() + s * 1000));
    startNextSeason(sys, new Date(NOW.getTime() + s * 1000 + 500));
    const placed = currentSeason(sys).tiers.flatMap((c) => c.teams.map((t) => t.id)).sort();
    assert.deepEqual(placed, everyone);
  }
  const mean = (i: number) => {
    const ts = currentSeason(sys).tiers[i]!.teams;
    return ts.reduce((t, x) => t + (x.strength ?? 0), 0) / ts.length;
  };
  assert.ok(mean(0) > mean(2) + 0.4, `top ${mean(0).toFixed(2)} vs bottom ${mean(2).toFixed(2)}`);
});

test("tier finals decide a tier's champion but not who is promoted", () => {
  const sys = system([8, 8], { finals: "final" });
  simulateSeason(sys, NOW);
  const season = currentSeason(sys);
  const o = seasonOutcome(sys);
  assert.equal(o.champions[0], champion(season.tiers[0]!));
  assert.deepEqual(o.promoted[0], tierTable(season.tiers[1]!).slice(0, 2));
});

test("seeding a cup from positions in the system", () => {
  const sys = system([8, 8, 8]);
  simulateSeason(sys, NOW);
  const tables = currentSeason(sys).tiers.map(tierTable);
  assert.deepEqual(systemTeams(sys).map((t) => t.id), tables.flat(), "tier by tier, best first");
  assert.deepEqual(systemTeams(sys, { tiers: [0, 2], topPerTier: 3 }).map((t) => t.id), [...tables[0]!.slice(0, 3), ...tables[2]!.slice(0, 3)]);
  assert.deepEqual(
    systemTeams(sys, { tiers: [0, 1], topPerTier: 2, order: "position" }).map((t) => t.id),
    [tables[0]![0], tables[1]![0], tables[0]![1], tables[1]![1]],
  );
  const picked = systemTeams(sys, { topPerTier: 4 });
  const cup = createCompetition({
    name: "System Cup", kind: "cup", teams: picked, seeds: picked.map((t) => t.id), seed: 2, now: NOW,
  });
  assert.equal(cup.teams.length, 12);
  assert.equal(cup.bracket![0], tables[0]![0], "the best team is seed 1");
  simulateAll(cup, NOW);
  assert.ok(champion(cup));
});

test("ratings and saving cover every season", () => {
  const sys = system([6, 6], {}, 5);
  simulateSeason(sys, NOW);
  startNextSeason(sys, new Date(NOW.getTime() + 1000));
  simulateSeason(sys, new Date(NOW.getTime() + 1000));
  assert.equal(allCompetitions(sys).length, 4);
  const rows = computeRatings(allCompetitions(sys));
  assert.equal(rows.length, 12);
  for (const r of rows) assert.equal(r.played, 20, "10 games a season for two seasons");
  assert.deepEqual(parseLeagueSystem(JSON.parse(JSON.stringify(sys))), sys);
});

test("bad system data is rejected, not trusted", () => {
  const sys = system([6, 6], { playoffs: true });
  simulateSeason(sys, NOW);
  startNextSeason(sys, NOW);
  const mutate = (fn: (s: LeagueSystem) => void) => {
    const c = structuredClone(sys);
    fn(c);
    return parseLeagueSystem(JSON.parse(JSON.stringify(c)));
  };
  assert.notEqual(mutate(() => {}), null);
  assert.equal(mutate((s) => { s.tierNames.length = 1; }), null);
  assert.equal(mutate((s) => { s.seasons[0]!.tiers.length = 1; }), null);
  assert.equal(mutate((s) => { s.seasons[0]!.outcome!.promoted[0]![0] = "nobody"; }), null);
  assert.equal(mutate((s) => { s.settings.promotionSpots = 0; }), null);
  assert.equal(mutate((s) => { s.seasons[0]!.tiers[0]!.fixtures[0]!.a = "nobody"; }), null);
  assert.equal(parseLeagueSystem(null), null);
  assert.equal(parseLeagueSystem({ version: 1 }), null);
});
