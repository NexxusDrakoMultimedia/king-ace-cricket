// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { fixtureSeed, mix32, replayFixture, teamOf } from "../src/competition.ts";
import type { Competition, Fixture } from "../src/competition.ts";
import { ballCommentary, LEAD_COMMENTATOR, playerOfMatch, statsCommentary } from "../src/commentary.ts";
import type { CommentaryLine } from "../src/commentary.ts";
import { buildScorebook } from "../src/scorebook.ts";
import type { PlayedMatch } from "../src/teamMatch.ts";
import { track } from "./analytics.ts";
import { icon } from "./icons.ts";
import type { IconName } from "./icons.ts";
import { esc, renderScorebook } from "./render.ts";
import { resultLine, teamName } from "./compview.ts";
import { $, findCompetition, formatDate } from "./state.ts";

/**
 * The match viewer: a full scorecard, or a broadcast with Pyra Drake as lead
 * commentator. Both replay the fixture from its seed, so nothing extra is stored.
 */

type Mode = "card" | "watch";
type Phase = "intro" | "play" | "break" | "result";
interface Alert { kind: string; icon: IconName; who: string; msg: string }

interface View {
  comp: Competition;
  fixture: Fixture;
  games: PlayedMatch[];
  consistent: boolean;
  gi: number;
  mode: Mode;
  phase: Phase;
  inn: 0 | 1;
  pos: number;
  lines: CommentaryLine[];
  alert: Alert | null;
  speed: 1 | 2 | 4;
  playing: boolean;
}

let v: View | null = null;
let timer: number | undefined;

function stopTimer(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

export function openMatch(compId: string, fixtureId: number, mode: Mode): void {
  const comp = findCompetition(compId);
  const fixture = comp?.fixtures.find((f) => f.id === fixtureId);
  if (!comp || !fixture?.result) return;
  const { games, consistent } = replayFixture(comp, fixture);
  v = { comp, fixture, games, consistent, gi: mode === "card" ? games.length - 1 : 0, mode, phase: "intro", inn: 0, pos: 0, lines: [], alert: null, speed: 1, playing: false };
  const dialog = $<HTMLDialogElement>("matchDialog");
  if (!dialog.open) dialog.showModal();
  draw();
}

export function closeMatch(): void {
  stopTimer();
  v = null;
}

const game = (): PlayedMatch => v!.games[v!.gi]!;
const gameSeed = (): number => {
  const base = fixtureSeed(v!.comp, v!.fixture);
  return v!.gi === 0 ? base : mix32(base, v!.gi);
};

function seriesBar(): string {
  if (v!.games.length < 2) return "";
  const buttons = v!.games
    .map((g, i) => `<button type="button" class="secondary small" data-action="mv-game" data-gi="${i}" ${i === v!.gi ? 'aria-current="true"' : ""}>Game ${i + 1}</button>`)
    .join("");
  return `<div class="seriesbar" role="group" aria-label="Games in this series">${buttons}</div>`;
}

function header(): string {
  const { comp, fixture } = v!;
  return `<p class="eyebrow">${esc(comp.name)} · ${esc(fixture.label)}</p>
    <h2>${teamName(comp, fixture.a)} v ${teamName(comp, fixture.b)}</h2>
    ${v!.consistent ? "" : `<p class="badge warning">${icon("warning", 16)} This replay no longer matches the saved result, because the rules changed after it was played.</p>`}`;
}

function potmLine(g: PlayedMatch): string {
  const books = g.result.innings.map((inn, i) => ({
    teamId: inn.teamId,
    scorebook: buildScorebook(teamOf(v!.comp, inn.teamId), g.logs![i]!, v!.comp.config),
  }));
  const p = playerOfMatch(books, g.result.winner);
  return p ? `Player of the match: ${esc(p.name)}, ${p.runs} off ${p.balls} (${esc(teamOf(v!.comp, p.teamId).name)})` : "";
}

function gameResult(g: PlayedMatch): string {
  const { comp } = v!;
  const [a, b] = g.result.innings;
  const verdict = g.result.winner === null ? "Tied" : `${esc(teamOf(comp, g.result.winner).name)} won ${/^(by|\d)/.test(g.result.margin) ? esc(g.result.margin) : `(${esc(g.result.margin)})`}`;
  return `${esc(teamOf(comp, a.teamId).name)} ${a.runs}/${a.wickets} · ${esc(teamOf(comp, b.teamId).name)} ${b.runs}/${b.wickets}. ${verdict}.`;
}

// ---- scorecard ----

function drawCard(): string {
  const { comp } = v!;
  const g = game();
  const sheets = g.result.innings
    .map((inn, i) => {
      const sb = buildScorebook(teamOf(comp, inn.teamId), g.logs![i]!, comp.config);
      return renderScorebook(sb, { dateText: formatDate(comp.createdAt), seed: gameSeed(), overs: comp.config.soloOvers, ballsPerOver: comp.config.ballsPerOver, finished: true });
    })
    .join("");
  return `${header()}${seriesBar()}
    <div class="panel"><p class="eyebrow">${v!.games.length > 1 ? `Game ${v!.gi + 1}` : "Result"}</p>
      <p><b>${gameResult(g)}</b></p><p class="hint">${potmLine(g)}</p>
      <p class="hint">${v!.fixture.result && v!.games.length > 1 ? `Series: ${esc(v!.fixture.result.margin)}` : ""}</p>
      <div class="row"><button type="button" class="primary" data-action="mv-switch" data-mode="watch">Watch broadcast</button></div></div>
    ${sheets}`;
}

// ---- broadcast ----

function battingName(): string {
  return teamName(v!.comp, game().result.innings[v!.inn].teamId);
}

function sceneIntro(): string {
  const { comp, fixture } = v!;
  const g = game();
  const first = g.result.innings[0].teamId;
  const strength = comp.settings.strength ? ` · Strength ${teamOf(comp, fixture.a).strength ?? 0} v ${teamOf(comp, fixture.b).strength ?? 0}` : "";
  const part = v!.games.length > 1 ? `Game ${v!.gi + 1} of the series` : fixture.label;
  return `<section class="scene"><p class="detail">${esc(comp.name)} · ${esc(fixture.label)}</p>
    <h2 class="title">${teamName(comp, fixture.a)} v ${teamName(comp, fixture.b)}</h2>
    <p class="sub">${esc(part)}. ${teamName(comp, first)} bat first.</p>
    <p class="detail">Commentary: ${esc(LEAD_COMMENTATOR.name)}${strength}</p>
    <button type="button" class="primary" data-action="bc-start">Start broadcast</button></section>`;
}

function commentatorCredit(): string {
  return `<div class="lowerthird"><span class="name">${esc(LEAD_COMMENTATOR.name)}</span><span class="sub">${esc(LEAD_COMMENTATOR.title)}</span></div>`;
}

function liveHtml(): string {
  if (!v) return "";
  const { comp } = v;
  const g = game();
  const log = g.logs![v.inn]!;
  const team = teamOf(comp, g.result.innings[v.inn].teamId);
  const sb = buildScorebook(team, log.slice(0, v.pos), comp.config);
  const t = sb.total;
  const total = comp.config.soloOvers * comp.config.ballsPerOver;
  let meta = `${esc(t.oversText)} overs · ${t.runRate.toFixed(2)} an over`;
  if (v.inn === 1) {
    const target = g.result.innings[0].runs + 1;
    meta = `Target ${target}. Need ${Math.max(0, target - t.runs)} from ${total - t.balls} balls`;
  }
  const alert = v.alert
    ? `<div class="alertpop" role="status"><span class="kind">${icon(v.alert.icon, 18)} ${esc(v.alert.kind)}</span><span class="who">${esc(v.alert.who)}</span><span class="msg">${esc(v.alert.msg)}</span></div>`
    : "";
  const lines = v.lines
    .map((l) => `<li class="${l.voice}"><span class="who">${esc(l.voice === "lead" ? LEAD_COMMENTATOR.name : "Stats desk")}</span><span class="txt">${esc(l.text)}</span></li>`)
    .join("");
  return `<div class="scorebug"><span class="team">${esc(team.name)}</span><span class="score">${t.runs}/${t.wickets}</span><span class="meta">${meta}</span></div>
    ${alert}<ul class="ticker" aria-live="off">${lines}</ul>`;
}

function drawPlay(): string {
  return `${header()}${seriesBar()}
    <div class="bc">
      ${commentatorCredit()}
      <div id="bcLive">${liveHtml()}</div>
      <div class="bcctl">
        <button type="button" class="secondary" id="bcPause" data-action="bc-pause" aria-pressed="${!v!.playing}">${v!.playing ? "Pause" : "Resume"}</button>
        <button type="button" class="secondary" data-action="bc-speed">Speed ${v!.speed}x</button>
        <button type="button" class="ghost" data-action="bc-skip-inn">Skip innings</button>
        <button type="button" class="ghost" data-action="bc-skip-all">Skip to result</button>
      </div>
    </div>`;
}

function drawBreak(): string {
  const { comp } = v!;
  const g = game();
  const [a, b] = g.result.innings;
  const total = comp.config.soloOvers * comp.config.ballsPerOver;
  return `${header()}<section class="scene"><p class="detail">Innings break</p>
    <h2 class="title">${esc(teamOf(comp, a.teamId).name)} ${a.runs}/${a.wickets}</h2>
    <p class="sub">${esc(teamOf(comp, b.teamId).name)} need ${a.runs + 1} to win from ${total} balls.</p>
    <button type="button" class="primary" data-action="bc-continue">Start the chase</button></section>`;
}

function drawResult(): string {
  const g = game();
  const { comp } = v!;
  const title = g.result.winner === null ? "Tied" : `${esc(teamOf(comp, g.result.winner).name)} win`;
  const series = v!.games.length > 1 ? `<p class="detail">Series: ${esc(v!.fixture.result!.margin)}${v!.gi < v!.games.length - 1 ? ` · ${v!.games.length - v!.gi - 1} more game${v!.games.length - v!.gi - 1 === 1 ? "" : "s"}` : ""}</p>` : "";
  const next = v!.gi < v!.games.length - 1 ? `<button type="button" class="primary" data-action="mv-game" data-gi="${v!.gi + 1}" data-play="1">Next game</button>` : "";
  return `${header()}${seriesBar()}<section class="scene"><p class="detail">Full time</p>
    <h2 class="title">${title}</h2><p class="sub">${gameResult(g)}</p><p class="detail">${potmLine(g)}</p>${series}
    <div class="row">${next}<button type="button" class="${next ? "secondary" : "primary"}" data-action="mv-switch" data-mode="card">Scorecard</button><button type="button" class="secondary" data-action="bc-restart">Watch again</button></div></section>`;
}

function draw(): void {
  if (!v) return;
  let html: string;
  if (v.mode === "card") html = drawCard();
  else html = v.phase === "intro" ? `${header()}${seriesBar()}${sceneIntro()}` : v.phase === "play" ? drawPlay() : v.phase === "break" ? drawBreak() : drawResult();
  $("matchRoot").innerHTML = html;
}

function alertFor(rec: { outcome: { kind: string; runs?: number }; redrawn?: unknown }, who: string, ctx: { strikerRuns: number; strikerBalls: number; milestone?: 50 | 100 }): Alert | null {
  if (rec.outcome.kind === "wicket") return { kind: "Wicket", icon: "error", who, msg: `${ctx.strikerRuns} off ${ctx.strikerBalls} balls` };
  if (ctx.milestone) return { kind: ctx.milestone === 100 ? "Hundred" : "Fifty", icon: "star", who, msg: `${ctx.strikerRuns} off ${ctx.strikerBalls} balls` };
  if (rec.outcome.runs === 6) return { kind: "Six", icon: "star", who, msg: `${ctx.strikerRuns} off ${ctx.strikerBalls} balls` };
  if (rec.outcome.runs === 4) return { kind: "Four", icon: "flag", who, msg: `${ctx.strikerRuns} off ${ctx.strikerBalls} balls` };
  if (rec.redrawn) return { kind: "Redraw", icon: "info", who, msg: "The King was discarded and drawn again" };
  return null;
}

function step(): void {
  if (!v || v.phase !== "play" || !v.playing) return;
  const g = game();
  const log = g.logs![v.inn]!;
  if (v.pos >= log.length) return finishInnings();
  const rec = log[v.pos]!;
  const team = teamOf(v.comp, g.result.innings[v.inn].teamId);
  const before = buildScorebook(team, log.slice(0, v.pos), v.comp.config);
  v.pos++;
  const after = buildScorebook(team, log.slice(0, v.pos), v.comp.config);
  const mark = after.overs.at(-1)!.marks.at(-1)!;
  const batter = after.batters[mark.batterNo - 1]!;
  const prev = before.batters[mark.batterNo - 1]!.runs;
  const milestone: 50 | 100 | undefined = prev < 100 && batter.runs >= 100 ? 100 : prev < 50 && batter.runs >= 50 ? 50 : undefined;
  const total = v.comp.config.soloOvers * v.comp.config.ballsPerOver;
  const ctx = {
    striker: batter.name, strikerRuns: batter.runs, strikerBalls: batter.balls, milestone,
    runs: after.total.runs, wickets: after.total.wickets,
    ...(v.inn === 1 ? { need: g.result.innings[0].runs + 1 - after.total.runs, ballsLeft: total - after.total.balls } : {}),
  };
  const stats = statsCommentary(ctx, rec.ball);
  const next: CommentaryLine[] = [ballCommentary(rec, ctx, v.gi * 1000 + v.inn), ...(stats ? [stats] : []), ...v.lines];
  v.lines = next.slice(0, 7);
  v.alert = alertFor(rec, batter.name, ctx) ?? v.alert;
  $("bcLive").innerHTML = liveHtml();
  if (v.pos >= log.length) finishInnings();
}

function finishInnings(): void {
  if (!v) return;
  stopTimer();
  v.playing = false;
  v.alert = null;
  if (v.inn === 0) {
    v.phase = "break";
  } else {
    v.phase = "result";
  }
  draw();
}

function startTimer(): void {
  stopTimer();
  timer = window.setInterval(step, 900 / v!.speed);
}

function begin(gi: number): void {
  track({ name: "broadcast_started" });
  stopTimer();
  v!.gi = gi;
  v!.phase = "play";
  v!.inn = 0;
  v!.pos = 0;
  v!.lines = [];
  v!.alert = null;
  v!.playing = true;
  draw();
  startTimer();
}

/** Handles the match viewer's buttons. Returns true if the click was one of ours. */
export function handleMatchAction(action: string, el: HTMLElement): boolean {
  if (!action.startsWith("mv-") && !action.startsWith("bc-")) return false;
  if (!v) return true;
  switch (action) {
    case "mv-game": {
      const gi = Number(el.dataset.gi);
      if (!Number.isInteger(gi) || gi < 0 || gi >= v.games.length) break;
      if (v.mode === "watch" && el.dataset.play) begin(gi);
      else {
        stopTimer();
        v.gi = gi;
        v.phase = "intro";
        draw();
      }
      break;
    }
    case "mv-switch":
      stopTimer();
      v.mode = el.dataset.mode === "watch" ? "watch" : "card";
      v.phase = "intro";
      v.gi = v.mode === "watch" ? 0 : v.games.length - 1;
      draw();
      break;
    case "bc-start":
    case "bc-restart":
      begin(v.gi);
      break;
    case "bc-pause":
      v.playing = !v.playing;
      if (v.playing) startTimer();
      else stopTimer();
      draw();
      $("bcPause").focus();
      break;
    case "bc-speed":
      v.speed = v.speed === 1 ? 2 : v.speed === 2 ? 4 : 1;
      if (v.playing) startTimer();
      draw();
      break;
    case "bc-skip-inn":
      v.pos = game().logs![v.inn]!.length;
      finishInnings();
      break;
    case "bc-skip-all":
      v.inn = 1;
      v.pos = game().logs![1]!.length;
      finishInnings();
      break;
    case "bc-continue":
      v.phase = "play";
      v.inn = 1;
      v.pos = 0;
      v.lines = [];
      v.alert = null;
      v.playing = true;
      draw();
      startTimer();
      break;
  }
  return true;
}

export { resultLine };
