// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CITIES, MASCOTS, NAME_GROUPS, REGIONS, generatePlayerNames, generateTeam, generateTeamName, generateTeams,
} from "../src/names.ts";
import type { Region } from "../src/names.ts";
import { makeRng } from "../src/rng.ts";
import { TEAM_SIZE } from "../src/match.ts";

const regions = REGIONS.map((r) => r.id);

test("generated teams have a name and eleven distinct players, in every region", () => {
  for (const region of [...regions, "world" as const]) {
    for (let seed = 1; seed <= 60; seed++) {
      const t = generateTeam(makeRng(seed), region);
      assert.ok(t.name.length > 0 && t.name.length <= 40, t.name);
      assert.equal(t.players.length, TEAM_SIZE);
      assert.equal(new Set(t.players).size, TEAM_SIZE);
      for (const p of t.players) assert.ok(p.length > 0 && p.length <= 40, p);
    }
  }
});

test("the same seed generates the same names; different seeds differ", () => {
  assert.deepEqual(generatePlayerNames(makeRng(7)), generatePlayerNames(makeRng(7)));
  assert.equal(generateTeamName(makeRng(7)), generateTeamName(makeRng(7)));
  assert.notDeepEqual(generatePlayerNames(makeRng(7)), generatePlayerNames(makeRng(8)));
});

test("name data is clean: no blanks, no duplicates, and every pairing fits in 40 characters", () => {
  for (const region of regions) {
    assert.ok(CITIES[region].length >= 8, `${region} cities`);
    assert.equal(new Set(CITIES[region]).size, CITIES[region].length, `${region} duplicate city`);
    for (const g of NAME_GROUPS[region]) {
      for (const list of [g.first, g.last]) {
        assert.ok(list.length >= 8, `${region} list too short`);
        assert.equal(new Set(list).size, list.length, `${region} duplicate name`);
        for (const n of list) assert.ok(n.trim() === n && n.length > 0, `bad entry "${n}"`);
      }
      for (const f of g.first) assert.ok(!f.includes(" "), `given names have no spaces: ${f}`);
      const longest = Math.max(...g.first.map((s) => s.length)) + 1 + Math.max(...g.last.map((s) => s.length));
      assert.ok(longest <= 40, `${region} longest name ${longest}`);
    }
  }
  assert.equal(new Set(MASCOTS).size, MASCOTS.length);
  const longestTeam = Math.max(...regions.flatMap((r) => CITIES[r].map((c) => c.length))) + 1 + Math.max(...MASCOTS.map((m) => m.length));
  assert.ok(longestTeam <= 40, `longest team name ${longestTeam}`);
});

test("mascots avoid the nicknames of well-known real franchises", () => {
  const real = ["Scorchers", "Sixers", "Thunder", "Stars", "Heat", "Strikers", "Hurricanes", "Renegades", "Titans", "Lions", "Kings", "Royals", "Knights", "Warriors", "Capitals", "Dolphins", "Cobras", "Sharks", "Outlaws", "Rockets", "Phoenix", "Spirit", "Brave", "Fire", "Gladiators", "Zalmi", "Qalandars", "Indians", "Riders", "Super Giants", "Challengers", "Sunrisers", "Invincibles", "Superchargers", "Originals", "Bears", "Vikings", "Lightning", "Tigers", "Bulls"];
  for (const m of MASCOTS) assert.ok(!real.includes(m), `${m} is a real franchise nickname`);
});

test("a regional team is named for a city in its region", () => {
  for (const region of regions) {
    for (let seed = 1; seed <= 40; seed++) {
      const t = generateTeam(makeRng(seed), region);
      assert.ok(CITIES[region].some((c) => t.name.startsWith(c + " ")), `${t.name} is not a ${region} city`);
    }
  }
});

test("most players on a regional team are from that region, with a few overseas", () => {
  const fits = (name: string, region: Region): boolean => {
    const first = name.split(" ")[0]!;
    const rest = name.slice(first.length + 1);
    return NAME_GROUPS[region].some((g) => g.first.includes(first) && g.last.includes(rest));
  };
  for (const region of regions) {
    let home = 0;
    let total = 0;
    for (let seed = 1; seed <= 150; seed++) {
      for (const p of generatePlayerNames(makeRng(seed), 11, region)) {
        total++;
        if (fits(p, region)) home++;
      }
    }
    const share = home / total;
    assert.ok(share > 0.8 && share < 0.99, `${region}: home share ${(share * 100).toFixed(0)}%`);
  }
});

test("every generated player name is a real First Last pairing from some region", () => {
  const known = (name: string): boolean => {
    const first = name.split(" ")[0]!;
    const rest = name.slice(first.length + 1);
    return regions.some((r) => NAME_GROUPS[r].some((g) => g.first.includes(first) && g.last.includes(rest)));
  };
  for (let seed = 1; seed <= 100; seed++) for (const p of generatePlayerNames(makeRng(seed))) assert.ok(known(p), p);
});

test("a single-region league is all from that region; a world league mixes regions", () => {
  const carib = generateTeams(makeRng(3), 8, new Set(), "caribbean");
  for (const t of carib) assert.ok(CITIES.caribbean.some((c) => t.name.startsWith(c + " ")), t.name);
  const world = generateTeams(makeRng(3), 16, new Set(), "world");
  const seen = new Set(world.map((t) => regions.find((r) => CITIES[r].some((c) => t.name.startsWith(c + " ")))));
  assert.ok(seen.size >= 4, `a 16-team world league should span several regions, got ${seen.size}`);
});
