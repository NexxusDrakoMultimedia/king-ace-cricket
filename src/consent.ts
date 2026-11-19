// SPDX-FileCopyrightText: 2026 Pyra Drake
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Cookie and analytics consent. Pure logic, so the rules are testable: nothing is
 * tracked without a recorded yes, the choice expires, and a browser's Global
 * Privacy Control signal is honoured.
 */

export type Purpose = "ga" | "gameanalytics";
export const PURPOSES: readonly Purpose[] = ["ga", "gameanalytics"];

export interface Consent {
  v: 1;
  ga: boolean;
  gameanalytics: boolean;
  /** When the choice was made (ISO 8601). */
  at: string;
}

/** A choice is asked again after this long. */
export const CONSENT_MAX_AGE_DAYS = 365;
export const CONSENT_KEY = "kac:v1:consent";

export function makeConsent(choice: Record<Purpose, boolean>, now: Date = new Date()): Consent {
  return { v: 1, ga: choice.ga, gameanalytics: choice.gameanalytics, at: now.toISOString() };
}

/** Reads a stored choice. Anything malformed counts as no choice. */
export function parseConsent(raw: unknown): Consent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const x = raw as Record<string, unknown>;
  if (x.v !== 1 || typeof x.ga !== "boolean" || typeof x.gameanalytics !== "boolean" || typeof x.at !== "string") return null;
  if (Number.isNaN(Date.parse(x.at))) return null;
  return { v: 1, ga: x.ga, gameanalytics: x.gameanalytics, at: x.at };
}

export function consentFresh(c: Consent, now: Date = new Date()): boolean {
  const age = now.getTime() - Date.parse(c.at);
  return age >= 0 && age < CONSENT_MAX_AGE_DAYS * 86_400_000;
}

export interface Decision {
  /** Show the first-visit banner. */
  showBanner: boolean;
  /** Which purposes may run right now. */
  allowed: Record<Purpose, boolean>;
  /** The browser is sending Global Privacy Control, so tracking stays off whatever was chosen. */
  gpc: boolean;
}

/**
 * What to do on page load. A purpose runs only if it is configured, a fresh yes is on
 * record for it, and Global Privacy Control is not set. The banner appears only when
 * something is configured, no fresh choice exists, and GPC is not set (GPC already
 * answers the question).
 */
export function decide(
  stored: Consent | null,
  opts: { available: Record<Purpose, boolean>; gpc: boolean; now?: Date },
): Decision {
  const now = opts.now ?? new Date();
  const anyAvailable = PURPOSES.some((p) => opts.available[p]);
  const fresh = stored && consentFresh(stored, now) ? stored : null;
  const allowed = {} as Record<Purpose, boolean>;
  for (const p of PURPOSES) allowed[p] = !!(opts.available[p] && fresh && fresh[p] && !opts.gpc);
  return { showBanner: anyAvailable && !fresh && !opts.gpc, allowed, gpc: opts.gpc };
}
