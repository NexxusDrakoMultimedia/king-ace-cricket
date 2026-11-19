// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * What the app may report to analytics. Every event is built from fixed categories
 * and bucketed counts, so there is no way to put a team name, a player name, a seed
 * or any other free text into one: the types forbid it, and `sanitise` enforces it
 * at runtime too.
 */

export type ViewName = "solo" | "comps" | "systems" | "ratings" | "records";
export type CompKind = "league" | "cup" | "event";
export type ExportKind = "match" | "competition" | "system" | "ratings" | "backup";

export type AppEvent =
  | { name: "app_open" }
  | { name: "view"; view: ViewName }
  | { name: "solo_started" }
  | { name: "competition_created"; kind: CompKind; teams: string; strength: boolean; fromSystem: boolean }
  | { name: "competition_completed"; kind: CompKind }
  | { name: "system_created"; tiers: number; playoffs: boolean }
  | { name: "season_completed"; tiers: number }
  | { name: "broadcast_started" }
  | { name: "data_exported"; kind: ExportKind }
  | { name: "data_imported" };

/** Team counts are reported in coarse buckets, never exactly. */
export function bucketTeams(n: number): string {
  if (n <= 4) return "2-4";
  if (n <= 8) return "5-8";
  if (n <= 16) return "9-16";
  if (n <= 64) return "17-64";
  return "65+";
}

export function kindOf(kind: "league" | "cup", settings: { finals: string; bestOf: number }): CompKind {
  return kind === "cup" ? "cup" : settings.finals === "semis" && settings.bestOf > 1 ? "event" : "league";
}

const VIEWS: readonly string[] = ["solo", "comps", "systems", "ratings", "records"];
const KINDS: readonly string[] = ["league", "cup", "event"];
const EXPORTS: readonly string[] = ["match", "competition", "system", "ratings", "backup"];
const BUCKETS: readonly string[] = ["2-4", "5-8", "9-16", "17-64", "65+"];

/** Drops anything that is not one of the allowed shapes. Returns null if the event is not valid. */
export function sanitise(e: AppEvent): AppEvent | null {
  switch (e.name) {
    case "app_open":
    case "solo_started":
    case "broadcast_started":
    case "data_imported":
      return { name: e.name };
    case "view":
      return VIEWS.includes(e.view) ? { name: "view", view: e.view } : null;
    case "competition_created":
      return KINDS.includes(e.kind) && BUCKETS.includes(e.teams)
        ? { name: "competition_created", kind: e.kind, teams: e.teams, strength: !!e.strength, fromSystem: !!e.fromSystem }
        : null;
    case "competition_completed":
      return KINDS.includes(e.kind) ? { name: "competition_completed", kind: e.kind } : null;
    case "system_created":
      return Number.isInteger(e.tiers) && e.tiers >= 2 && e.tiers <= 8 ? { name: "system_created", tiers: e.tiers, playoffs: !!e.playoffs } : null;
    case "season_completed":
      return Number.isInteger(e.tiers) && e.tiers >= 2 && e.tiers <= 8 ? { name: "season_completed", tiers: e.tiers } : null;
    case "data_exported":
      return EXPORTS.includes(e.kind) ? { name: "data_exported", kind: e.kind } : null;
    default:
      return null;
  }
}

export interface GaEvent {
  name: string;
  params: Record<string, string | number | boolean>;
}

/** Google Analytics 4: an event name and flat parameters. */
export function toGa(e: AppEvent): GaEvent {
  const { name, ...rest } = e;
  const params: Record<string, string | number | boolean> = {};
  // GA4 parameter names are snake_case by convention: fromSystem becomes from_system.
  for (const [k, v] of Object.entries(rest)) params[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = v as string | number | boolean;
  return name === "view" ? { name: "page_view", params: { page_title: String(params.view), page_path: `/${params.view}` } } : { name, params };
}

export type GaProgression = { status: "Start" | "Complete"; p1: string; p2: string };
export interface GameAnalyticsCall {
  /** A design event: 1 to 5 segments separated by ":", each at most 32 characters. */
  design: { id: string; value?: number };
  /** Also a progression event for competitions. */
  progression?: GaProgression;
}

/** GameAnalytics: a design event id, and a progression event where it fits. */
export function toGameAnalytics(e: AppEvent): GameAnalyticsCall {
  switch (e.name) {
    case "view": return { design: { id: `view:${e.view}` } };
    case "competition_created": return { design: { id: `competition:created:${e.kind}` }, progression: { status: "Start", p1: "competition", p2: e.kind } };
    case "competition_completed": return { design: { id: `competition:completed:${e.kind}` }, progression: { status: "Complete", p1: "competition", p2: e.kind } };
    case "system_created": return { design: { id: "system:created", value: e.tiers } };
    case "season_completed": return { design: { id: "system:season:completed", value: e.tiers } };
    case "data_exported": return { design: { id: `data:exported:${e.kind}` } };
    default: return { design: { id: e.name.replace(/_/g, ":") } };
  }
}
