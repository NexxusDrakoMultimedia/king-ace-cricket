// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { cardLabel, isRed } from "../src/cards.ts";
import type { Card } from "../src/cards.ts";
import type { BallRecord, Config } from "../src/innings.ts";
import type { BallMark, Fall, Scorebook } from "../src/scorebook.ts";

/** Escape text for safe use in HTML text or attribute values. Team and player names are user input. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function cardHtml(card: Card, cls = ""): string {
  return `<span class="card${isRed(card) ? " red" : ""}${cls ? " " + cls : ""}">${esc(cardLabel(card))}</span>`;
}

function markHtml(m: BallMark): string {
  const cls = (m.wicket ? "w" : m.runs >= 4 ? `b b${m.runs}` : m.runs === 0 ? "dot" : "r") + (m.redrawn ? " rd" : "");
  const title = m.redrawn ? `${cardLabel(m.card)} (redrew ${cardLabel(m.redrawn)})` : cardLabel(m.card);
  return `<span class="mk ${cls}" title="${esc(title)}">${esc(m.label)}</span>`;
}

/**
 * The bowling card: one line per bowler when the fielding side is known (a match
 * between two teams), otherwise the fielding side's figures in one line.
 */
function bowlingCard(sb: Scorebook): string {
  const head = `<thead><tr><th>Bowler</th><th class="num">O</th><th class="num">M</th><th class="num">R</th><th class="num">W</th><th class="num">Econ</th></tr></thead>`;
  if (sb.bowlingTeamName === undefined) {
    const b = sb.bowling;
    return `<table class="bowl">${head}
      <tbody><tr><td class="ink">Fielding side</td><td class="num ink">${esc(b.oversText)}</td>
        <td class="num ink">${b.maidens}</td><td class="num ink">${b.runs}</td><td class="num ink">${b.wickets}</td>
        <td class="num ink">${sb.total.balls ? sb.total.runRate.toFixed(2) : ""}</td></tr></tbody>
    </table>`;
  }
  const rows = sb.bowlers
    .map((b) => `<tr><td class="ink">${esc(b.name)}</td><td class="num ink">${esc(b.oversText)}</td><td class="num ink">${b.maidens}</td>
      <td class="num ink">${b.runs}</td><td class="num ink">${b.wickets}</td><td class="num ink">${b.economy === null ? "" : b.economy.toFixed(2)}</td></tr>`)
    .join("");
  return `<p class="fine">${esc(sb.bowlingTeamName)}</p><table class="bowl">${head}
    <tbody>${rows || `<tr><td colspan="6" class="ink">No balls bowled yet</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td class="num ink">${esc(sb.bowling.oversText)}</td><td class="num ink">${sb.bowling.maidens}</td>
      <td class="num ink">${sb.bowling.runs}</td><td class="num ink">${sb.bowling.wickets}</td><td></td></tr></tfoot></table>`;
}

export interface SheetInfo {
  dateText: string;
  seed: number;
  overs: number;
  ballsPerOver: number;
  finished: boolean;
}

/** The paper scorebook: batting card, extras and total, fall of wickets, runs ladder, over by over, bowling. */
export function renderScorebook(sb: Scorebook, info: SheetInfo): string {
  const t = sb.total;
  const rows = sb.batters
    .map((b) => {
      const how = b.out
        ? `${b.out.bowler ? `<span class="ink">b ${esc(b.out.bowler)}</span> ` : ""}${cardHtml(b.out.card)} <span class="wk">W${b.out.wicketNo}</span> <span class="at">${esc(b.out.at)} ov</span>`
        : b.entered
          ? `<span class="notout">${info.finished || t.allOut ? "not out" : "batting"}</span>`
          : "";
      return `<tr class="${b.entered ? "" : "dnb"}">
        <td class="no">${b.no}</td>
        <td class="name ink">${esc(b.name)}</td>
        <td class="how">${how}</td>
        <td class="marks"><div class="mkrow">${b.marks.map(markHtml).join("")}</div></td>
        <td class="num ink">${b.entered ? b.runs : ""}</td>
        <td class="num ink">${b.entered ? b.balls : ""}</td>
        <td class="num ink">${b.entered ? b.fours : ""}</td>
        <td class="num ink">${b.entered ? b.sixes : ""}</td>
      </tr>`;
    })
    .join("");

  const fallsBy = new Map<number, Fall[]>();
  for (const f of sb.falls) fallsBy.set(f.score, [...(fallsBy.get(f.score) ?? []), f]);
  const ladderSize = Math.max(160, Math.ceil((t.runs + 1) / 20) * 20 + 20);
  const cell = (n: number): string => {
    const falls = fallsBy.get(n);
    const cls = ["cell", n <= t.runs ? "struck" : "", falls ? "fall" : ""].filter(Boolean).join(" ");
    const sup = falls ? `<sup>${falls.map((f) => f.batterNo).join(",")}</sup>` : "";
    return `<span class="${cls}">${n}${sup}</span>`;
  };
  const zeroFalls = fallsBy.get(0);
  const zero = zeroFalls
    ? `<span class="cell fall zero">0<sup>${zeroFalls.map((f) => f.batterNo).join(",")}</sup></span>`
    : "";
  const ladder = Array.from({ length: ladderSize }, (_, i) => cell(i + 1)).join("");

  const fallList = sb.falls.length
    ? sb.falls
        .map(
          (f) =>
            `<li><b>${f.wicketNo}</b>–${f.score} <small>(${f.batterNo}, ${esc(f.at)} ov)</small></li>`,
        )
        .join("")
    : `<li class="none">No wickets yet</li>`;

  const named = sb.bowlers.length > 0 || sb.bowlingTeamName !== undefined;
  const overRows = Array.from({ length: info.overs }, (_, i) => {
    const o = sb.overs.find((x) => x.over === i);
    const boxes = Array.from({ length: info.ballsPerOver }, (_, j) => {
      const m = o?.marks[j];
      return `<span class="box">${m ? markHtml(m) : ""}</span>`;
    }).join("");
    return `<tr>
      <td class="no">${i + 1}</td>${named ? `<td class="ink">${o?.bowler ? esc(o.bowler) : ""}</td>` : ""}
      <td><div class="mkrow">${boxes}</div></td>
      <td class="num ink">${o ? o.runs : ""}${o?.maiden ? ' <small class="m">M</small>' : ""}</td>
      <td class="num ink">${o ? o.wickets || "" : ""}</td>
      <td class="num ink tot">${o ? o.total : ""}</td>
    </tr>`;
  }).join("");

  const status = t.allOut ? "All out" : info.finished ? "Innings complete" : "In progress";

  return `<article class="sheet">
    <header class="sheet-head">
      <div class="field"><span class="label">Batting</span><span class="ink big">${esc(sb.teamName)}</span></div>
      <div class="field"><span class="label">Date</span><span class="ink">${esc(info.dateText)}</span></div>
      <div class="field"><span class="label">Overs</span><span class="ink">${info.overs}</span></div>
      <div class="field"><span class="label">Seed</span><span class="ink">${info.seed}</span></div>
    </header>

    <div class="scroll">
      <table class="bat">
        <thead><tr>
          <th class="no">No.</th><th>Batter</th><th>How out</th><th>Balls faced</th>
          <th class="num">Runs</th><th class="num">Balls</th><th class="num">4s</th><th class="num">6s</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr class="extras"><td></td><td>Extras</td><td colspan="2" class="ink">none (no byes, wides or no-balls in this game)</td><td class="num ink">0</td><td colspan="3"></td></tr>
          <tr class="total"><td></td><td>Total</td>
            <td colspan="2" class="ink">${t.runs} for ${t.wickets} <small>(${esc(t.oversText)} overs, ${t.runRate.toFixed(2)} an over) · ${status}</small></td>
            <td class="num ink big">${t.runs}</td><td colspan="3"></td></tr>
        </tfoot>
      </table>
    </div>

    <div class="grid2">
      <section>
        <h3>Fall of wickets</h3>
        <ul class="falls">${fallList}</ul>
        <p class="fine">wicket–score (batter no., overs)</p>
      </section>
      <section>
        <h3>Bowling</h3>
        ${bowlingCard(sb)}
      </section>
    </div>

    <section>
      <h3>Runs</h3>
      <div class="ladder" role="img" aria-label="Team score ladder: ${t.runs} runs scored, ${t.wickets} wickets">${zero}${ladder}</div>
      <p class="fine">Each run is struck through. A circled score is where a wicket fell, with the batter's number.</p>
    </section>

    <section>
      <h3>Over by over</h3>
      <div class="scroll">
        <table class="overs">
          <thead><tr><th class="no">Over</th>${named ? "<th>Bowler</th>" : ""}<th>Balls</th><th class="num">Runs</th><th class="num">Wkts</th><th class="num">Total</th></tr></thead>
          <tbody>${overRows}</tbody>
        </table>
      </div>
    </section>
  </article>`;
}

/** The current over's hand of cards and the result of the last ball. */
export function renderStage(log: readonly BallRecord[], progress: number, sb: Scorebook, finished: boolean): string {
  if (log.length === 0) return "";
  const anchor = log[Math.min(progress, log.length - 1)]!;
  const overNo = anchor.over;
  const hand = log.map((rec, idx) => ({ rec, idx })).filter((x) => x.rec.over === overNo);
  const cards = hand
    .map(({ rec, idx }, i) => {
      const played = idx < progress;
      const last = idx === progress - 1;
      return `<span class="slot"><span class="slotno">${i + 1}</span>${
        played ? cardHtml(rec.bat, last ? "last" : "played") : `<span class="card back" aria-label="face down"></span>`
      }</span>`;
    })
    .join("");

  let message = "Press Play ball to face the first delivery.";
  if (progress > 0) {
    const mark = sb.overs.at(-1)?.marks.at(-1);
    const who = mark ? (sb.batters[mark.batterNo - 1]?.name ?? "") : "";
    if (mark?.wicket) message = `WICKET! ${who} is out for a King (${cardLabel(mark.card)}).`;
    else if (mark && mark.runs === 6) message = `SIX! ${who} clears the rope (${cardLabel(mark.card)}).`;
    else if (mark && mark.runs === 4) message = `FOUR! ${who} finds the boundary (${cardLabel(mark.card)}).`;
    else if (mark && mark.runs > 0) message = `${mark.runs} run${mark.runs === 1 ? "" : "s"} to ${who} (${cardLabel(mark.card)}).`;
    else if (mark) message = `Dot ball (${cardLabel(mark.card)}).`;
  }
  if (finished) {
    const t = sb.total;
    message = t.allOut
      ? `All out for ${t.runs} after ${t.oversText} overs.`
      : `Innings complete: ${t.runs} for ${t.wickets} after ${t.oversText} overs.`;
  }
  return `<div class="hand-title">Over ${overNo + 1}</div>
    <div class="hand" role="img" aria-label="Hand for over ${overNo + 1}">${cards}</div>
    <p class="result${finished ? " done" : ""}">${esc(message)}</p>`;
}
