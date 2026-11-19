// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, isComplete, standings, teamOf } from "../src/competition.ts";
import type { Competition, Fixture } from "../src/competition.ts";
import { icon } from "./icons.ts";
import { esc } from "./render.ts";

/** Shared renderers for a competition: tags, standings, fixtures. Used by the Competitions and Leagues views. */

export const teamName = (comp: Competition, id: string): string => esc(teamOf(comp, id).name);

export function kindLabel(comp: Competition): string {
  if (comp.kind === "cup") return "Cup";
  return comp.settings.finals === "semis" && comp.settings.bestOf > 1 ? "Event" : "League";
}

export function tags(comp: Competition): string {
  const t = [kindLabel(comp), `${comp.teams.length} teams`, `${comp.config.soloOvers} overs`];
  if (comp.settings.strength) t.push("strength on");
  if (comp.settings.bestOf > 1 || comp.settings.finalBestOf > 1) t.push(`best of ${comp.settings.bestOf}/${comp.settings.finalBestOf}`);
  return t.map((x) => `<span class="tag">${esc(x)}</span>`).join("");
}

export function statusBadge(comp: Competition): string {
  if (isComplete(comp)) return `<span class="badge success">${icon("check", 16)} Complete</span>`;
  const played = comp.fixtures.filter((f) => f.result).length;
  return `<span class="badge warning">${icon("clock", 16)} ${played} of ${comp.fixtures.length}+ played</span>`;
}

/** "Kestrels 140/6 · Wolves 138/9. Kestrels won by 2 runs." */
export function resultLine(comp: Competition, f: Fixture): string {
  const r = f.result;
  if (!r) return "";
  const [a, b] = r.innings;
  const score = (i: typeof a): string => `${teamName(comp, i.teamId)} ${i.runs}/${i.wickets}`;
  const verdict =
    r.winner === null
      ? "Tied"
      : `<span class="win">${teamName(comp, r.winner)}</span> won ${/^(by|\d)/.test(r.margin) ? esc(r.margin) : `(${esc(r.margin)})`}`;
  return `${score(a)} · ${score(b)}. ${verdict}.`;
}

export interface Zones {
  /** Rows at the top highlighted as promotion places. */
  up?: number;
  /** Rows at the bottom highlighted as relegation places. */
  down?: number;
}

export function renderStandings(comp: Competition, zones: Zones = {}): string {
  const rows = standings(comp);
  const champ = isComplete(comp) ? champion(comp) : null;
  const strength = comp.settings.strength;
  const body = rows
    .map((r, i) => {
      const cls = [r.teamId === champ && comp.settings.finals === "none" ? "hl" : "", zones.up && i < zones.up ? "zone" : "", zones.down && i >= rows.length - zones.down ? "drop" : ""]
        .filter(Boolean)
        .join(" ");
      return `<tr class="${cls}">
        <td class="num">${i + 1}</td><td>${esc(r.name)}</td>
        ${strength ? `<td class="num">${teamOf(comp, r.teamId).strength ?? 0}</td>` : ""}
        <td class="num">${r.played}</td><td class="num">${r.won}</td><td class="num">${r.lost}</td><td class="num">${r.tied}</td>
        <td class="num"><b>${r.points}</b></td><td class="num">${r.nrr >= 0 ? "+" : ""}${r.nrr.toFixed(2)}</td></tr>`;
    })
    .join("");
  return `<div class="scroll"><table class="tbl">
    <thead><tr><th class="num">#</th><th>Team</th>${strength ? '<th class="num">Str</th>' : ""}<th class="num">P</th><th class="num">W</th><th class="num">L</th><th class="num">T</th><th class="num">Pts</th><th class="num">NRR</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

function roundTitle(fixtures: Fixture[]): string {
  const first = fixtures[0]!;
  // "Quarter-final 3" is headed "Quarter-final"; "Round of 64" keeps its number.
  return first.label.replace(/^(Quarter-final|Semi-final) \d+$/, "$1");
}

export function renderFixtures(comp: Competition): string {
  const rounds = new Map<number, Fixture[]>();
  for (const f of comp.fixtures) rounds.set(f.round, [...(rounds.get(f.round) ?? []), f]);
  const html = [...rounds.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, fixtures]) => {
      const items = fixtures
        .map((f) => {
          const buttons = f.result
            ? `<button type="button" class="secondary small" data-action="fx-card" data-comp="${esc(comp.id)}" data-fx="${f.id}">Scorecard</button>
               <button type="button" class="ghost small" data-action="fx-watch" data-comp="${esc(comp.id)}" data-fx="${f.id}">Broadcast</button>`
            : "";
          return `<li><span class="teams">${teamName(comp, f.a)} v ${teamName(comp, f.b)}${f.series ? ` <span class="tag">series ${f.series.length} games</span>` : ""}</span>
            <span class="res">${f.result ? resultLine(comp, f) : "Not played yet"}</span>${buttons}</li>`;
        })
        .join("");
      return `<h3 class="roundname">${esc(roundTitle(fixtures))}</h3><ul class="fx">${items}</ul>`;
    })
    .join("");
  const waiting = !isComplete(comp) && comp.fixtures.every((f) => f.result) ? `<p class="hint">The next round is drawn when you simulate on.</p>` : "";
  return html + waiting;
}

export function renderChampion(comp: Competition): string {
  const champ = isComplete(comp) ? champion(comp) : null;
  if (!champ) return "";
  return `<div class="panel"><p class="eyebrow">${comp.kind === "cup" ? "Cup winners" : "Champions"}</p><h2>${teamName(comp, champ)}</h2></div>`;
}

/** Standings (leagues) and fixtures. */
export function renderBody(comp: Competition, zones: Zones = {}): string {
  const table = comp.kind === "league" ? `<h3>Table</h3>${renderStandings(comp, zones)}` : "";
  return `${renderChampion(comp)}${table}<h3>${comp.kind === "cup" ? "Draw and results" : "Fixtures and results"}</h3>${renderFixtures(comp)}`;
}
