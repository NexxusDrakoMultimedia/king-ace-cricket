// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { bracketRounds } from "../src/insights.ts";
import type { BracketRound, BracketTie } from "../src/insights.ts";
import { champion, isComplete, teamOf } from "../src/competition.ts";
import type { Competition } from "../src/competition.ts";
import { truncate } from "./charts.ts";
import { esc } from "./render.ts";

/**
 * The knockout bracket as an SVG tree. A tie with a result opens its scorecard when
 * clicked (or on Enter or Space). A very large cup shows its last rounds; the earlier
 * ones are in the fixtures list.
 */

const COL_W = 212;
const BOX_W = 184;
const ROW_H = 22;
const BOX_H = ROW_H * 2;
const GAP = 10;
const HEAD = 30;
/** Most first-column ties drawn, so a 1,024-team cup stays a sensible picture. */
export const MAX_FIRST_COLUMN = 32;

function nameOf(comp: Competition, id: string | null): string | null {
  if (!id) return null;
  try {
    return teamOf(comp, id).name;
  } catch {
    return id;
  }
}

function row(comp: Competition, t: BracketTie, side: "a" | "b", x: number, y: number): string {
  const id = side === "a" ? t.a : t.b;
  const name = nameOf(comp, id);
  const score = side === "a" ? t.scoreA : t.scoreB;
  const won = !!id && t.winner === id;
  const lost = !!id && !!t.winner && t.winner !== id;
  const cls = ["trow", won ? "won" : "", lost ? "lost" : "", name ? "" : "empty"].filter(Boolean).join(" ");
  const text = name ? truncate(name, 20) : t.bye && side === "b" ? "bye" : "to be decided";
  const full = name ?? text;
  return `<g class="${cls}"><rect class="rowbg" x="${x}" y="${y}" width="${BOX_W}" height="${ROW_H}"/>
    ${won ? `<rect class="winbar" x="${x}" y="${y}" width="4" height="${ROW_H}"/>` : ""}
    <text class="tname" x="${x + 10}" y="${y + 15}">${esc(text)}<title>${esc(full)}</title></text>
    ${score ? `<text class="tscore" x="${x + BOX_W - 6}" y="${y + 15}" text-anchor="end">${esc(score)}</text>` : ""}</g>`;
}

function tieLabel(comp: Competition, t: BracketTie): string {
  const a = nameOf(comp, t.a) ?? "to be decided";
  const b = nameOf(comp, t.b) ?? (t.bye ? "bye" : "to be decided");
  const w = nameOf(comp, t.winner);
  return `${a} v ${b}${w && !t.bye ? `. ${w} won ${t.note}` : t.fixtureId === null ? "" : ". Not played yet"}`;
}

export function renderBracket(comp: Competition): string {
  const all = bracketRounds(comp);
  if (!all) {
    const when = comp.kind === "groups" ? "when the group stage ends" : "when the league stage ends";
    return comp.settings.playoffSpots > 0 || comp.kind === "groups" ? `<p class="hint">The bracket is drawn ${when}.</p>` : "";
  }
  // Drop the earliest rounds while the first column would be too tall.
  let skip = 0;
  while (all[skip]!.ties.length > MAX_FIRST_COLUMN && skip < all.length - 1) skip++;
  const rounds: BracketRound[] = all.slice(skip);
  const rows = rounds[0]!.ties.length;
  const slot = BOX_H + GAP;
  const width = rounds.length * COL_W + 16;
  const height = HEAD + rows * slot + 4;

  // Vertical centre of each tie: the first column is evenly spaced, each later one sits between its two feeders.
  const centres: number[][] = [rounds[0]!.ties.map((_, i) => HEAD + i * slot + BOX_H / 2)];
  for (let c = 1; c < rounds.length; c++) {
    const prev = centres[c - 1]!;
    centres.push(rounds[c]!.ties.map((_, j) => ((prev[2 * j] ?? prev[prev.length - 1]!) + (prev[2 * j + 1] ?? prev[2 * j] ?? 0)) / 2));
  }

  let links = "";
  let boxes = "";
  rounds.forEach((r, c) => {
    const x = 8 + c * COL_W;
    boxes += `<text class="roundhead" x="${x}" y="16">${esc(r.title)}</text>`;
    r.ties.forEach((t, i) => {
      const cy = centres[c]![i]!;
      const y = cy - BOX_H / 2;
      const playable = t.fixtureId !== null && !t.bye && !!t.winner;
      const cls = `tie${playable ? " open" : ""}${t.bye ? " bye" : ""}`;
      const attrs = playable
        ? ` data-action="fx-card" data-comp="${esc(comp.id)}" data-fx="${t.fixtureId}" role="button" tabindex="0" aria-label="${esc(`Open scorecard: ${tieLabel(comp, t)}`)}"`
        : ` role="group" aria-label="${esc(tieLabel(comp, t))}"`;
      boxes += `<g class="${cls}"${attrs}><rect class="tbox" x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}"/>
        ${row(comp, t, "a", x, y)}${row(comp, t, "b", x, y + ROW_H)}<line class="tsplit" x1="${x}" x2="${x + BOX_W}" y1="${y + ROW_H}" y2="${y + ROW_H}"/></g>`;
      if (c > 0) {
        const prev = centres[c - 1]!;
        const x1 = 8 + (c - 1) * COL_W + BOX_W;
        const mid = x1 + (COL_W - BOX_W) / 2;
        for (const k of [2 * i, 2 * i + 1]) {
          if (prev[k] === undefined) continue;
          links += `<path class="link" d="M${x1} ${prev[k]} H${mid} V${cy} H${x}"/>`;
        }
      }
    });
  });

  const done = isComplete(comp);
  const champ = done ? nameOf(comp, champion(comp)) : null;
  const note = skip > 0 ? `<p class="hint">Showing the last ${rounds.length} rounds. The earlier ones are in the fixtures below.</p>` : "";
  const label = `Knockout bracket: ${rounds.map((r) => r.title).join(", ")}.${champ ? ` Champion: ${champ}.` : ""}`;
  return `<div class="scroll bracket"><svg class="chart fixed" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${esc(label)}">${links}${boxes}</svg></div>
    ${note}<p class="hint">Winners move right. Select a finished tie to open its scorecard.</p>`;
}
