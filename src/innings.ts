// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { Deck, KING } from "./cards.ts";
import type { Card } from "./cards.ts";
import { resolveSolo, resolveTwoPlayer } from "./rules.ts";
import type { Outcome } from "./rules.ts";
import type { Rng } from "./rng.ts";

export interface Config {
  /** Two-player overs per innings. 10: wickets fall steadily and ~14% of innings end all out. */
  overs: number;
  /** Solo overs per innings. 20: the solo table is tuned to T20 length. */
  soloOvers: number;
  ballsPerOver: number; // 6; a hand is exactly one over
  maxWickets: number; // 10
  /** Solo: reshuffle all 52 cards every N overs (README: 4). */
  soloReshuffleEvery: number;
  /** Two-player: reshuffle every N overs (hand = over, "every 2 hands" = 2). */
  twoPlayerReshuffleEvery: number;
}

export const DEFAULT_CONFIG: Config = {
  overs: 10,
  soloOvers: 20,
  ballsPerOver: 6,
  maxWickets: 10,
  soloReshuffleEvery: 4,
  twoPlayerReshuffleEvery: 2,
};

export interface BallRecord {
  over: number; // 0-based
  ball: number; // 0-based within over
  bat: Card;
  bowl?: Card; // absent in solo
  outcome: Outcome;
  /** Solo with team strength: the King that was discarded before `bat` was drawn in its place. */
  redrawn?: Card;
}

export interface InningsResult {
  runs: number;
  wickets: number;
  balls: number;
  allOut: boolean;
  /** Redraws spent (always 0 unless the team had redraws, see `SoloOptions`). */
  redrawsUsed: number;
  log?: BallRecord[];
}

export interface SoloOptions {
  log?: boolean;
  /**
   * Team strength: redraws available this innings. When a King would dismiss the
   * batter and a redraw is left, the King is discarded and a fresh card is drawn
   * (which counts, even if it is another King). 0 changes nothing.
   */
  redraws?: number;
  /** Chasing: the innings ends as soon as the score passes this target. */
  target?: number;
}

/** A strategy picks which card (by index) to play from the hand this ball. */
export interface BallContext {
  over: number;
  ball: number;
  runs: number;
  wickets: number;
}
export type Strategy = (hand: readonly Card[], ctx: BallContext, rng: Rng) => number;

export const randomStrategy: Strategy = (hand, _ctx, rng) => Math.floor(rng() * hand.length);

function apply(state: { runs: number; wickets: number }, o: Outcome): void {
  if (o.kind === "runs") state.runs += o.runs;
  else if (o.kind === "wicket") state.wickets++;
}

export function playSoloInnings(
  rng: Rng,
  config: Config = DEFAULT_CONFIG,
  opts: SoloOptions = {},
): InningsResult {
  const deck = new Deck(rng);
  const s = { runs: 0, wickets: 0 };
  const log: BallRecord[] | undefined = opts.log ? [] : undefined;
  let redrawsLeft = Math.max(0, Math.floor(opts.redraws ?? 0));
  let redrawsUsed = 0;
  const chaseDone = (): boolean => opts.target !== undefined && s.runs > opts.target;
  let balls = 0;
  for (let over = 0; over < config.soloOvers && s.wickets < config.maxWickets && !chaseDone(); over++) {
    if (over > 0 && over % config.soloReshuffleEvery === 0) deck.reshuffle();
    const hand = deck.draw(config.ballsPerOver);
    // Solo: every card in the hand is played, so order doesn't change the totals.
    for (let ball = 0; ball < hand.length && s.wickets < config.maxWickets && !chaseDone(); ball++) {
      let bat = hand[ball]!;
      let redrawn: Card | undefined;
      if (bat.rank === KING && redrawsLeft > 0) {
        redrawsLeft--;
        redrawsUsed++;
        redrawn = bat;
        bat = deck.draw(1)[0]!;
      }
      const outcome = resolveSolo(bat);
      apply(s, outcome);
      balls++;
      log?.push(redrawn ? { over, ball, bat, outcome, redrawn } : { over, ball, bat, outcome });
    }
  }
  return { ...s, balls, allOut: s.wickets >= config.maxWickets, redrawsUsed, log };
}

export function playTwoPlayerInnings(
  rng: Rng,
  batStrategy: Strategy,
  bowlStrategy: Strategy,
  config: Config = DEFAULT_CONFIG,
  opts: { log?: boolean } = {},
): InningsResult {
  const deck = new Deck(rng);
  const s = { runs: 0, wickets: 0 };
  const log: BallRecord[] | undefined = opts.log ? [] : undefined;
  let balls = 0;
  for (let over = 0; over < config.overs && s.wickets < config.maxWickets; over++) {
    if (over > 0 && over % config.twoPlayerReshuffleEvery === 0) deck.reshuffle();
    const batHand = deck.draw(config.ballsPerOver);
    const bowlHand = deck.draw(config.ballsPerOver);
    for (let ball = 0; ball < config.ballsPerOver && s.wickets < config.maxWickets; ball++) {
      const ctx: BallContext = { over, ball, runs: s.runs, wickets: s.wickets };
      const bat = batHand.splice(batStrategy(batHand, ctx, rng), 1)[0]!;
      const bowl = bowlHand.splice(bowlStrategy(bowlHand, ctx, rng), 1)[0]!;
      const outcome = resolveTwoPlayer(bat, bowl);
      apply(s, outcome);
      balls++;
      log?.push({ over, ball, bat, bowl, outcome });
    }
  }
  return { ...s, balls, allOut: s.wickets >= config.maxWickets, redrawsUsed: 0, log };
}
