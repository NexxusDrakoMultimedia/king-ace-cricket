// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { buildLeaderboards } from "../src/leaderboards.ts";
import type { Board, BoardRow } from "../src/leaderboards.ts";
import type { Profiles } from "../src/profiles.ts";
import { esc } from "./render.ts";

/** The record books: ranked tables in the manner of Wisden's Almanack. */

function nameCell(r: BoardRow): string {
  const name = r.link
    ? `<button type="button" class="ghost small" data-action="rec-open" data-kind="${r.link.kind}" data-id="${esc(r.link.id)}">${esc(r.name)}</button>`
    : esc(r.name);
  return `${name}${r.sub ? `<small>${esc(r.sub)}</small>` : ""}`;
}

const text = (c: string): boolean => /^(Match|Against|Format|Champions|Runners-up)$/.test(c);

function board(b: Board): string {
  const head = b.columns.map((c) => `<th class="${text(c) ? "" : "num"}">${esc(c)}</th>`).join("");
  const body = b.rows
    .map(
      (r) => `<tr><td class="rank">${esc(r.rank)}</td><th scope="row" class="who">${nameCell(r)}</th>${r.cells
        .map((c, i) => `<td class="${text(b.columns[i] ?? "") ? "" : "num"}">${esc(c)}</td>`)
        .join("")}</tr>`,
    )
    .join("");
  return `<figure class="board"><figcaption><b>${esc(b.title)}</b><small>${esc(b.note)}</small></figcaption>
    <div class="scroll"><table class="tbl almanack"><thead><tr><th class="rank">#</th><th>${b.id === "roll" ? "Competition" : /^(totals|lowest|big-wins|narrow-wins|titles|wins|win-rate)$/.test(b.id) ? "Team" : "Player"}</th>${head}</tr></thead>
    <tbody>${body}</tbody></table></div></figure>`;
}

function section(title: string, note: string, boards: Board[]): string {
  if (boards.length === 0) return "";
  return `<h3>${esc(title)}</h3>${note ? `<p class="hint">${esc(note)}</p>` : ""}<div class="almanacks">${boards.map(board).join("")}</div>`;
}

export function renderLeaderboards(profiles: Profiles): string {
  const lb = buildLeaderboards(profiles);
  const html =
    section("Roll of honour", "", lb.honours) +
    section("Batting", "Ranked from every match played. Ties share a place and show an equals sign. A star means not out.", lb.batting) +
    section("Bowling", "Figures are the scorebook's. The cards alone decide every ball, so who bowls is a rotation of the tail (numbers 11 to 7), not a skill.", lb.bowling) +
    section("Teams", "", lb.teams);
  return html || `<div class="panel"><p>The record books are empty. They fill in as matches are played in a League, Cup, Major or Worlds.</p></div>`;
}
