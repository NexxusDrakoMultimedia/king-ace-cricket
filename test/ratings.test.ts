// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import { createCompetition, simulateAll } from "../src/competition.ts";
import { generateTeams } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { computeRatings, eloExpected, eloUpdate, glickoUpdate, ratingsToCsv, START_RATING } from "../src/ratings.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const league = (seed: number, n = 8, strength = false) => {
  const c = createCompetition({
    name: "L", kind: "league", teams: generateTeams(makeRng(seed), n), seed, now: new Date(NOW.getTime() + seed),
    settings: { strength, rounds: 2 },
  });
  simulateAll(c, NOW);
  return c;
};

test("Elo: equal players move 16 points and the total is conserved", () => {
  assert.equal(eloExpected(1500, 1500), 0.5);
  const [a, b] = eloUpdate(1500, 1500, 1);
  assert.equal(a, 1516);
  assert.equal(b, 1484);
  const [x, y] = eloUpdate(1700, 1400, 0.5);
  assert.ok(Math.abs(x + y - 3100) < 1e-9);
  assert.ok(x < 1700 && y > 1400, "the favourite loses points on a tie");
});

test("Glicko-1 matches the worked example in Glickman's paper", () => {
  // r=1500, RD=200 vs (1400, 30) win, (1550, 100) loss, (1700, 300) loss => r'=1464, RD'=151.4
  const out = glickoUpdate(1500, 200, [
    { r: 1400, rd: 30, score: 1 },
    { r: 1550, rd: 100, score: 0 },
    { r: 1700, rd: 300, score: 0 },
  ]);
  assert.ok(Math.abs(out.r - 1464.1) < 0.2, `rating ${out.r}`);
  assert.ok(Math.abs(out.rd - 151.4) < 0.2, `rd ${out.rd}`);
  assert.deepEqual(glickoUpdate(1500, 200, []), { r: 1500, rd: 200 });
});

test("ratings come from competition results, and conserve Elo", () => {
  const comp = league(3);
  const rows = computeRatings([comp]);
  assert.equal(rows.length, 8);
  const total = rows.reduce((t, r) => t + r.elo, 0);
  assert.ok(Math.abs(total - 8 * START_RATING) < 1e-6, "Elo only moves points between teams");
  for (const r of rows) {
    assert.equal(r.played, 14);
    assert.equal(r.won + r.lost + r.tied, 14);
    assert.ok(r.rd < 350 && r.rd >= 30);
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1]!.elo >= rows[i]!.elo);
  // A team that won more than it lost is rated above 1500.
  for (const r of rows) if (r.won - r.lost >= 4) assert.ok(r.elo > START_RATING);
});

test("ratings are deterministic and vanish when the competition is removed", () => {
  const a = league(4);
  assert.deepEqual(computeRatings([a]), computeRatings([structuredClone(a)]));
  assert.deepEqual(computeRatings([]), []);
  const b = league(5);
  assert.equal(computeRatings([a, b]).length, 16);
});

test("a team that plays in several competitions keeps one accumulating rating", () => {
  const shared = generateTeams(makeRng(8), 4);
  const run = (seed: number, offset: number) => {
    const c = createCompetition({ name: "L", kind: "league", teams: shared, seed, now: new Date(NOW.getTime() + offset) });
    simulateAll(c, NOW);
    return c;
  };
  const rows = computeRatings([run(1, 0), run(2, 1000)]);
  assert.equal(rows.length, 4);
  for (const r of rows) assert.equal(r.played, 6);
});

test("strength ON: strong teams end up rated above weak teams; the ratings notice", () => {
  const strong: number[] = [];
  const weak: number[] = [];
  for (let s = 1; s <= 25; s++) {
    const c = league(100 + s, 8, true);
    const rows = computeRatings([c]);
    for (const r of rows) {
      const t = c.teams.find((x) => x.id === r.teamId)!;
      if ((t.strength ?? 0) >= 4) strong.push(r.elo);
      if ((t.strength ?? 0) <= 1) weak.push(r.elo);
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(strong.length > 20 && weak.length > 20);
  assert.ok(mean(strong) > mean(weak) + 30, `strong ${mean(strong).toFixed(0)} vs weak ${mean(weak).toFixed(0)}`);
});

test("CSV export quotes cells and defuses spreadsheet formulas", () => {
  const rows = [
    { teamId: "1", name: '=HYPERLINK("http://x")', elo: 1520.4, glicko: 1510, rd: 120, played: 3, won: 2, lost: 1, tied: 0 },
    { teamId: "2", name: 'Say "hi", team', elo: 1480, glicko: 1490, rd: 120, played: 3, won: 1, lost: 2, tied: 0 },
  ];
  const csv = ratingsToCsv(rows);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[1]!, /^"1","'=HYPERLINK\(""http:\/\/x""\)","1520"/);
  assert.match(lines[2]!, /"Say ""hi"", team"/);
});
