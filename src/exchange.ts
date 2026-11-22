// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseCompetition } from "./competition.ts";
import type { Competition } from "./competition.ts";
import { parseMatch, parseTeam } from "./match.ts";
import type { MatchRecord, Team } from "./match.ts";

/** The file format for exporting and importing matches and teams (plain JSON). */
export interface ExportBundle {
  format: "king-ace-cricket";
  version: 1;
  exportedAt: string;
  matches: MatchRecord[];
  teams: Team[];
  /** Leagues and cups. Ratings are derived from these, so they travel with them. */
  competitions: Competition[];
}

export const MAX_IMPORT_CHARS = 5_000_000;

export function buildExport(
  matches: MatchRecord[],
  teams: Team[],
  now: Date = new Date(),
  competitions: Competition[] = [],
): ExportBundle {
  return { format: "king-ace-cricket", version: 1, exportedAt: now.toISOString(), matches, teams, competitions };
}

export interface ImportResult {
  matches: MatchRecord[];
  teams: Team[];
  competitions: Competition[];
  /** Entries in the file that failed validation and were ignored. */
  skipped: number;
  error?: string;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Read an exported file. Accepts a full bundle, a single match, a single team, a
 * single competition, or a bare array of matches. Everything is validated; bad
 * entries are skipped. Tiered league systems are no longer part of the game, so
 * any in an older file are left out.
 */
export function parseImport(text: string): ImportResult {
  const fail = (error: string): ImportResult => ({ matches: [], teams: [], competitions: [], skipped: 0, error });
  if (text.length > MAX_IMPORT_CHARS) return fail("That file is too large to import.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("That file isn't valid JSON.");
  }

  const matches: MatchRecord[] = [];
  const teams: Team[] = [];
  const competitions: Competition[] = [];
  let skipped = 0;
  const addMatch = (x: unknown): void => {
    const m = parseMatch(x);
    if (m) matches.push(m);
    else skipped++;
  };
  const addTeam = (x: unknown): void => {
    const t = parseTeam(x);
    if (t) teams.push(t);
    else skipped++;
  };

  const addCompetition = (x: unknown): void => {
    const c = parseCompetition(x);
    if (c) competitions.push(c);
    else skipped++;
  };

  if (Array.isArray(data)) {
    data.forEach(addMatch);
  } else if (isObj(data)) {
    if ("seasons" in data) {
      return fail("That file is a tiered league system, and those are no longer part of the game.");
    } else if ("fixtures" in data) {
      // A single competition. Checked first because it has a `teams` list of its own
      // and would otherwise be mistaken for a bundle.
      addCompetition(data);
    } else if (Array.isArray(data.matches) || Array.isArray(data.teams) || Array.isArray(data.competitions)) {
      (Array.isArray(data.matches) ? data.matches : []).forEach(addMatch);
      (Array.isArray(data.teams) ? data.teams : []).forEach(addTeam);
      (Array.isArray(data.competitions) ? data.competitions : []).forEach(addCompetition);
    } else if ("innings" in data) {
      addMatch(data);
    } else if ("players" in data) {
      addTeam(data);
    } else {
      return fail("That doesn't look like a King and Ace Cricket file.");
    }
  } else {
    return fail("That doesn't look like a King and Ace Cricket file.");
  }
  if (!matches.length && !teams.length && !competitions.length) {
    return { matches, teams, competitions, skipped, error: "Nothing valid to import in that file." };
  }
  return { matches, teams, competitions, skipped };
}
