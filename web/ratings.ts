// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

import { computeRatings, ratingsToCsv } from "../src/ratings.ts";
import { track } from "./analytics.ts";
import { esc } from "./render.ts";
import { $, download, everyCompetition } from "./state.ts";

/** Elo and Glicko ratings, computed from every completed match in every competition. */
export function renderRatings(): void {
  const rows = computeRatings(everyCompetition());
  const body = rows
    .map(
      (r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.name)}</td><td class="num"><b>${Math.round(r.elo)}</b></td>
        <td class="num">${Math.round(r.glicko)} <small>±${Math.round(r.rd)}</small></td><td class="num">${r.played}</td>
        <td class="num">${r.won}-${r.lost}-${r.tied}</td></tr>`,
    )
    .join("");
  $("ratingsRoot").innerHTML = `<div class="head"><div><p class="eyebrow">Built from every match played</p><h2>Ratings</h2></div>
      <div class="row flush"><button type="button" class="secondary" data-action="rt-csv" ${rows.length ? "" : "disabled"}>Export CSV</button>
      <button type="button" class="secondary" data-action="rt-json" ${rows.length ? "" : "disabled"}>Export JSON</button></div></div>
    ${rows.length
      ? `<div class="scroll"><table class="tbl"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Elo</th><th class="num">Glicko</th><th class="num">Played</th><th class="num">W-L-T</th></tr></thead><tbody>${body}</tbody></table></div>`
      : `<div class="panel"><p>No ratings yet. Play some matches in a league, cup or event and every team's Elo and Glicko rating will appear here.</p></div>`}
    <p class="hint">Everyone starts on 1500. Elo moves match by match (K of 32, a tie counts as half a win). Glicko-1 treats each round of a competition as one rating period, and the ± is its uncertainty: it shrinks as a team plays more. Ratings are worked out from the results, so deleting a competition removes its effect.</p>`;
}

export function handleRatingAction(action: string): boolean {
  if (action !== "rt-csv" && action !== "rt-json") return false;
  const rows = computeRatings(everyCompetition());
  track({ name: "data_exported", kind: "ratings" });
  if (action === "rt-csv") download("king-ace-cricket-ratings.csv", ratingsToCsv(rows), "text/csv");
  else download("king-ace-cricket-ratings.json", { format: "king-ace-cricket-ratings", exportedAt: new Date().toISOString(), ratings: rows });
  return true;
}
