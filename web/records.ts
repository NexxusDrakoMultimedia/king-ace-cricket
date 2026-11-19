// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { average, buildProfiles, strikeRate } from "../src/profiles.ts";
import type { CompetitionRecord, Honour, PlayerRecord, Profiles, TeamRecord } from "../src/profiles.ts";
import { computeRatings } from "../src/ratings.ts";
import type { RatingRow } from "../src/ratings.ts";
import { icon } from "./icons.ts";
import type { IconName } from "./icons.ts";
import { esc } from "./render.ts";
import { $, data, everyCompetition } from "./state.ts";

/** Records: a profile with honours for every team, player and competition, built from the matches played. */

type Tab = "teams" | "players" | "competitions";
interface Selected { kind: Tab; id: string }

let tab: Tab = "teams";
let selected: Selected | null = null;
let query = "";
let cache: { version: number; profiles: Profiles; ratings: Map<string, RatingRow> } | null = null;

function loaded(): NonNullable<typeof cache> {
  if (!cache || cache.version !== data.version) {
    cache = {
      version: data.version,
      profiles: buildProfiles(data.comps, data.systems),
      ratings: new Map(computeRatings(everyCompetition()).map((r) => [r.teamId, r])),
    };
  }
  return cache;
}

const HONOUR_ICON: Record<Honour["kind"], IconName> = {
  champion: "star", "runner-up": "flag", promoted: "arrow-right", relegated: "warning",
  "top-scorer": "pen", "most-sixes": "play", "final-potm": "mic",
};

function honours(list: Honour[]): string {
  if (list.length === 0) return `<p class="hint">No honours yet.</p>`;
  return `<ul class="honours">${list
    .map((h) => `<li class="${h.kind === "champion" ? "gold" : ""}">${icon(HONOUR_ICON[h.kind], 18)} <span><b>${esc(h.title)}</b> <small>${esc(h.source)}</small></span></li>`)
    .join("")}</ul>`;
}

const stat = (label: string, value: string | number): string => `<div class="stat"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`;
const f1 = (n: number | null): string => (n === null ? "-" : n.toFixed(1));
const link = (kind: Tab, id: string, text: string): string => `<button type="button" class="ghost small" data-action="rec-open" data-kind="${kind}" data-id="${esc(id)}">${esc(text)}</button>`;

function playerRow(p: PlayerRecord): string {
  const s = p.stats;
  return `<tr><td class="num">${p.slot + 1}</td><td>${link("players", p.key, p.name)}</td><td class="num">${s.innings}</td><td class="num"><b>${s.runs}</b></td>
    <td class="num">${s.highest}${s.highestNotOut ? "*" : ""}</td><td class="num">${f1(average(s))}</td><td class="num">${f1(strikeRate(s))}</td>
    <td class="num">${s.fifties}</td><td class="num">${s.hundreds}</td><td class="num">${s.fours}</td><td class="num">${s.sixes}</td><td class="num">${s.potm}</td></tr>`;
}

function teamDetail(t: TeamRecord, ratings: Map<string, RatingRow>, p: Profiles): string {
  const r = ratings.get(t.teamId);
  const squad = t.roster.map((k) => p.players.get(k)).filter((x): x is PlayerRecord => !!x);
  return `<p class="eyebrow"><span class="tag">strength ${t.strength}</span>${t.titles ? `<span class="tag">${t.titles} title${t.titles === 1 ? "" : "s"}</span>` : ""}</p><h2>${esc(t.name)}</h2>
    <div class="statgrid">${stat("Played", t.played)}${stat("Won", t.won)}${stat("Lost", t.lost)}${stat("Tied", t.tied)}${stat("Elo", r ? Math.round(r.elo) : "-")}${stat("Glicko", r ? Math.round(r.glicko) : "-")}${stat("Highest", t.highest)}${stat("Lowest", t.played ? t.lowest : "-")}</div>
    <p class="hint">Recent form: ${t.form.length ? esc(t.form.join(" ")) : "no matches yet"}</p>
    <h3>Honours</h3>${honours(t.honours)}
    <h3>Squad</h3><div class="scroll"><table class="tbl"><thead><tr><th class="num">#</th><th>Player</th><th class="num">Inns</th><th class="num">Runs</th><th class="num">HS</th><th class="num">Avg</th><th class="num">SR</th><th class="num">50</th><th class="num">100</th><th class="num">4s</th><th class="num">6s</th><th class="num">POM</th></tr></thead><tbody>${squad.map(playerRow).join("")}</tbody></table></div>`;
}

function playerDetail(pl: PlayerRecord): string {
  const s = pl.stats;
  return `<p class="eyebrow">${link("teams", pl.teamId, pl.teamName)} · batting number ${pl.slot + 1}</p><h2>${esc(pl.name)}</h2>
    <div class="statgrid">${stat("Innings", s.innings)}${stat("Runs", s.runs)}${stat("Highest", `${s.highest}${s.highestNotOut ? "*" : ""}`)}${stat("Average", f1(average(s)))}${stat("Strike rate", f1(strikeRate(s)))}${stat("Fifties", s.fifties)}${stat("Hundreds", s.hundreds)}${stat("Fours", s.fours)}${stat("Sixes", s.sixes)}${stat("Ducks", s.ducks)}${stat("Player of the match", s.potm)}</div>
    <h3>Honours</h3>${honours(pl.honours)}`;
}

function compDetail(c: CompetitionRecord, p: Profiles): string {
  const name = (id: string | null): string => (id ? esc(p.teams.get(id)?.name ?? id) : "-");
  const leaders = (title: string, l: CompetitionRecord["topRuns"]): string =>
    l.length
      ? `<h3>${esc(title)}</h3><table class="tbl"><tbody>${l.map((x) => `<tr><td>${link("players", x.key, x.name)}</td><td>${esc(x.teamName)}</td><td class="num"><b>${x.value}</b></td></tr>`).join("")}</tbody></table>`
      : "";
  return `<p class="eyebrow"><span class="tag">${c.kind}</span><span class="tag">${c.complete ? "complete" : "in progress"}</span></p><h2>${esc(c.name)}</h2>
    <div class="statgrid">${stat("Matches", c.matches)}${stat("Champions", c.championId ? p.teams.get(c.championId)?.name ?? "-" : "-")}${stat("Runners-up", c.runnerUpId ? p.teams.get(c.runnerUpId)?.name ?? "-" : "-")}</div>
    ${c.highestTotal ? `<p>Highest total: <b>${c.highestTotal.runs}</b> by ${name(c.highestTotal.teamId)} <small>${esc(c.highestTotal.label)}</small></p>` : ""}
    ${c.biggestWin ? `<p>Biggest win: <b>${c.biggestWin.runs} runs</b> by ${name(c.biggestWin.teamId)} <small>${esc(c.biggestWin.label)}</small></p>` : ""}
    ${leaders("Most runs", c.topRuns)}${leaders("Most sixes", c.topSixes)}`;
}

function listHtml(): string {
  const { profiles, ratings } = loaded();
  const q = query.trim().toLowerCase();
  const match = (s: string): boolean => !q || s.toLowerCase().includes(q);
  let items: string[] = [];
  if (tab === "teams") {
    items = [...profiles.teams.values()]
      .filter((t) => match(t.name))
      .sort((a, b) => b.titles - a.titles || (ratings.get(b.teamId)?.elo ?? 0) - (ratings.get(a.teamId)?.elo ?? 0) || a.name.localeCompare(b.name))
      .map((t) => `<li><span class="grow">${link("teams", t.teamId, t.name)}<small>${t.won}-${t.lost}-${t.tied}${t.titles ? ` · ${t.titles} title${t.titles === 1 ? "" : "s"}` : ""}</small></span></li>`);
  } else if (tab === "players") {
    items = [...profiles.players.values()]
      .filter((p) => p.stats.innings > 0 && (match(p.name) || match(p.teamName)))
      .sort((a, b) => b.stats.runs - a.stats.runs || a.name.localeCompare(b.name))
      .map((p) => `<li><span class="grow">${link("players", p.key, p.name)}<small>${esc(p.teamName)} · ${p.stats.runs} runs${p.honours.length ? ` · ${p.honours.length} honour${p.honours.length === 1 ? "" : "s"}` : ""}</small></span></li>`);
  } else {
    items = [...profiles.competitions.values()]
      .filter((c) => match(c.name))
      .map((c) => `<li><span class="grow">${link("competitions", c.id, c.name)}<small>${c.complete ? "complete" : "in progress"} · ${c.matches} matches</small></span></li>`);
  }
  const shown = items.slice(0, 150);
  return `${shown.join("") || `<li class="none">Nothing here yet. Records fill in as matches are played.</li>`}${items.length > shown.length ? `<li class="none">Showing ${shown.length} of ${items.length}. Search to narrow it down.</li>` : ""}`;
}

export function renderRecords(): void {
  const root = $("recordsRoot");
  const { profiles, ratings } = loaded();
  let detail = "";
  if (selected) {
    if (selected.kind === "teams") {
      const t = profiles.teams.get(selected.id);
      if (t) detail = teamDetail(t, ratings, profiles);
    } else if (selected.kind === "players") {
      const p = profiles.players.get(selected.id);
      if (p) detail = playerDetail(p);
    } else {
      const c = profiles.competitions.get(selected.id);
      if (c) detail = compDetail(c, profiles);
    }
  }
  const tabs = (["teams", "players", "competitions"] as const)
    .map((t) => `<button type="button" data-action="rec-tab" data-kind="${t}" ${t === tab && !detail ? 'aria-current="true"' : ""}>${t}</button>`)
    .join("");
  root.innerHTML = `<div class="head"><div><p class="eyebrow">Profiles and honours</p><h2>Records</h2></div></div>
    <div class="tabs2" role="group" aria-label="Records">${tabs}</div>
    ${detail
      ? `<button type="button" class="ghost" data-action="rec-back">Back to ${tab}</button><div class="panel">${detail}</div>`
      : `<label class="search">Search<input id="recSearch" type="search" value="${esc(query)}" autocomplete="off"></label><ul id="recList" class="list">${listHtml()}</ul>`}`;
}

export function initRecords(): void {
  $("recordsRoot").addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.id !== "recSearch") return;
    query = el.value;
    $("recList").innerHTML = listHtml();
  });
}

export function handleRecordAction(action: string, el: HTMLElement): boolean {
  if (!action.startsWith("rec-")) return false;
  if (action === "rec-tab") {
    tab = (el.dataset.kind as Tab) ?? "teams";
    selected = null;
    query = "";
  } else if (action === "rec-open") {
    selected = { kind: el.dataset.kind as Tab, id: el.dataset.id ?? "" };
    tab = selected.kind;
    $("viewRecords").scrollIntoView?.();
  } else if (action === "rec-back") {
    selected = null;
  }
  renderRecords();
  return true;
}
