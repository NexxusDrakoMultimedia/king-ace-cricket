// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { champion, formatOf, groupName, isComplete, standings, teamOf } from "../src/competition.ts";
import type { Competition, Fixture } from "../src/competition.ts";
import { renderBracket } from "./bracket.ts";
import { icon } from "./icons.ts";
import { competitionStats } from "./insightview.ts";
import { esc } from "./render.ts";

/** Shared renderers for a competition: tags, standings, fixtures. */

export const teamName = (comp: Competition, id: string): string => esc(teamOf(comp, id).name);

/** League, Cup, Major (a league with playoffs) or Worlds (groups, then a knockout). */
export function kindLabel(comp: Competition): string {
  return formatOf(comp);
}

export function tags(comp: Competition): string {
  const t = [kindLabel(comp), `${comp.teams.length} teams`, `${comp.config.soloOvers} overs`];
  if (comp.settings.playoffSpots > 0) t.push(`top ${comp.settings.playoffSpots} to playoffs`);
  if (comp.groups) t.push(`${comp.groups.length} group${comp.groups.length === 1 ? "" : "s"}, top ${comp.settings.groupAdvance} through`);
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

/** A league table, or one Worlds group's (`ids`). The top `spots` rows are marked as going through. */
export function renderStandings(comp: Competition, ids?: readonly string[]): string {
  const rows = standings(comp, ids);
  const champ = isComplete(comp) ? champion(comp) : null;
  const strength = comp.settings.strength;
  const spots = ids ? comp.settings.groupAdvance : comp.settings.playoffSpots;
  const body = rows
    .map((r, i) => {
      const cls = [r.teamId === champ && spots === 0 ? "hl" : "", i < spots ? "zone" : ""].filter(Boolean).join(" ");
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
  // "Quarter-final 3" is headed "Quarter-final"; "Round of 64" keeps its number;
  // "Group B, round 2" is headed "Group stage, round 2" (every group plays that round).
  return first.label.replace(/^(Quarter-final|Semi-final) \d+$/, "$1").replace(/^Group \S+, round (\d+)$/, "Group stage, round $1");
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
          const group = /^(Group \S+), round/.exec(f.label)?.[1];
          return `<li><span class="teams">${group ? `<span class="tag">${esc(group)}</span> ` : ""}${teamName(comp, f.a)} v ${teamName(comp, f.b)}${f.series ? ` <span class="tag">series ${f.series.length} games</span>` : ""}</span>
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
  const title = { League: "Champions", Cup: "Cup winners", Major: "Champions", Worlds: "World champions" }[formatOf(comp)];
  return `<div class="panel"><p class="eyebrow">${title}</p><h2>${teamName(comp, champ)}</h2></div>`;
}

/** Standings (leagues) and fixtures. */
export function renderBody(comp: Competition): string {
  const spots = comp.settings.playoffSpots;
  let size = 1;
  while (size < spots) size *= 2;
  const nByes = size - spots;
  const byes = nByes === 1 ? " The top seed gets a bye to the second round." : nByes > 1 ? ` Seeds 1 to ${nByes} get a bye to the second round.` : "";
  const key = comp.kind === "league" && spots > 0
    ? `<p class="hint">The top ${spots} go through to the playoffs, seeded by their place in the table: the best seed plays the lowest.${byes}</p>`
    : "";
  let table = comp.kind === "league" ? `<h3>Table</h3>${renderStandings(comp)}${key}` : "";
  if (comp.groups) {
    const adv = comp.settings.groupAdvance;
    const through = comp.groups.length * adv;
    let ko = 1;
    while (ko < through) ko *= 2;
    const groupByes = ko - through;
    table = comp.groups.map((g, i) => `<h3>${esc(groupName(i))}</h3>${renderStandings(comp, g)}`).join("") +
      `<p class="hint">The top ${adv === 1 ? "team" : adv} of each group go${adv === 1 ? "es" : ""} through to the knockout, ${through} in all. Group winners are seeded first, then ${adv > 1 ? "runners-up, and so on" : "by points per game"}, and teams from the same group are kept apart in the first knockout round where they can be.${groupByes === 1 ? " The top seed gets a bye to the second round." : groupByes > 1 ? ` Seeds 1 to ${groupByes} get a bye to the second round.` : ""}</p>`;
  }
  const hasKnockout = comp.kind !== "league" || spots > 0;
  const bracket = hasKnockout ? `<h3>Bracket</h3>${renderBracket(comp)}` : "";
  return `${renderChampion(comp)}${table}${bracket}${competitionStats(comp)}<h3>${comp.kind === "cup" ? "Draw and results" : "Fixtures and results"}</h3>${renderFixtures(comp)}`;
}
