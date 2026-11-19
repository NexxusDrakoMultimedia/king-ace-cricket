// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { playSoloInnings } from "./innings.ts";
import type { BallRecord, Config } from "./innings.ts";
import { clampStrength } from "./match.ts";
import type { Team } from "./match.ts";
import { makeRng } from "./rng.ts";

/**
 * Bump when a rule change would make old seeds play out differently. Saved
 * competitions keep their results, but scorecards are regenerated from seeds, so
 * a mismatch is detected and reported rather than shown wrongly.
 */
export const RULES_VERSION = 1;

export interface InningsSummary {
  teamId: string;
  runs: number;
  wickets: number;
  balls: number;
  allOut: boolean;
  redrawsUsed: number;
}

export interface MatchResult {
  /** Both innings in batting order: [0] batted first, [1] chased. */
  innings: [InningsSummary, InningsSummary];
  /** Winning team id, or null for a tie. */
  winner: string | null;
  /** e.g. "by 14 runs", "by 6 wickets (11 balls left)", "tie". */
  margin: string;
  /** Set when a knockout tie was settled. */
  tiebreak?: "wickets" | "coin";
}

export interface MatchSettings {
  /** If true, each team's strength (redraws per innings) applies. If false, teams are equal. */
  strength: boolean;
  /** Knockout matches cannot end tied. */
  knockout: boolean;
}

export interface PlayedMatch {
  result: MatchResult;
  /** The ball-by-ball logs, in batting order, when requested. */
  logs?: [BallRecord[], BallRecord[]];
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Play one match: a coin toss (the winner bats), then two solo innings, the
 * second chasing the first. Fully determined by `seed`, so it can be replayed.
 */
export function playTeamMatch(
  a: Team,
  b: Team,
  seed: number,
  config: Config,
  settings: MatchSettings,
  withLogs = false,
): PlayedMatch {
  const rng = makeRng(seed);
  const aFirst = rng() < 0.5;
  const first = aFirst ? a : b;
  const second = aFirst ? b : a;
  const redraws = (t: Team): number => (settings.strength ? clampStrength(t.strength) : 0);

  const i1 = playSoloInnings(rng, config, { log: withLogs, redraws: redraws(first) });
  const i2 = playSoloInnings(rng, config, { log: withLogs, redraws: redraws(second), target: i1.runs });

  const sum = (t: Team, r: typeof i1): InningsSummary => ({
    teamId: t.id, runs: r.runs, wickets: r.wickets, balls: r.balls, allOut: r.allOut, redrawsUsed: r.redrawsUsed,
  });
  const s1 = sum(first, i1);
  const s2 = sum(second, i2);

  let winner: string | null;
  let margin: string;
  let tiebreak: "wickets" | "coin" | undefined;
  if (s2.runs > s1.runs) {
    winner = second.id;
    const ballsLeft = config.soloOvers * config.ballsPerOver - s2.balls;
    margin = `by ${plural(config.maxWickets - s2.wickets, "wicket")} (${plural(ballsLeft, "ball")} left)`;
  } else if (s2.runs < s1.runs) {
    winner = first.id;
    margin = `by ${plural(s1.runs - s2.runs, "run")}`;
  } else if (!settings.knockout) {
    winner = null;
    margin = "tie";
  } else if (s1.wickets !== s2.wickets) {
    winner = s1.wickets < s2.wickets ? first.id : second.id;
    margin = "tie, won on fewer wickets lost";
    tiebreak = "wickets";
  } else {
    winner = rng() < 0.5 ? first.id : second.id;
    margin = "tie, won on a coin toss";
    tiebreak = "coin";
  }

  const result: MatchResult = { innings: [s1, s2], winner, margin };
  if (tiebreak) result.tiebreak = tiebreak;
  const out: PlayedMatch = { result };
  if (withLogs) out.logs = [i1.log ?? [], i2.log ?? []];
  return out;
}
