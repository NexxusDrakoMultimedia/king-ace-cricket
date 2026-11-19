// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_CONFIG, playSoloInnings, playTwoPlayerInnings, randomStrategy } from "./innings.ts";
import type { InningsResult } from "./innings.ts";
import { makeRng } from "./rng.ts";

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const n = arg("innings", 20000);
const overs = arg("overs", DEFAULT_CONFIG.overs);
const soloOvers = arg("solo-overs", DEFAULT_CONFIG.soloOvers);
const seed = arg("seed", 1);
const config = { ...DEFAULT_CONFIG, overs, soloOvers };

function summarise(label: string, results: InningsResult[]): void {
  const runs = results.map((r) => r.runs).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const m = mean(runs);
  const sd = Math.sqrt(mean(runs.map((x) => (x - m) ** 2)));
  const q = (p: number) => runs[Math.floor(p * (runs.length - 1))]!;
  console.log(`\n${label} (${results.length} innings)`);
  console.log(`  runs     mean ${m.toFixed(1)}  sd ${sd.toFixed(1)}  p10 ${q(0.1)}  median ${q(0.5)}  p90 ${q(0.9)}`);
  console.log(`  wickets  mean ${mean(results.map((r) => r.wickets)).toFixed(2)}`);
  console.log(`  all out  ${((results.filter((r) => r.allOut).length / results.length) * 100).toFixed(1)}%`);
  console.log(`  run rate ${(mean(results.map((r) => (r.runs * 6) / r.balls))).toFixed(2)} per over`);
}

const rng = makeRng(seed);
summarise(`Solo, ${soloOvers} overs`,Array.from({ length: n }, () => playSoloInnings(rng, config)));
summarise(
  `Two-player, ${overs} overs, random vs random`,
  Array.from({ length: n }, () => playTwoPlayerInnings(rng, randomStrategy, randomStrategy, config)),
);
