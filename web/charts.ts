// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

import { esc } from "./render.ts";

/**
 * Small SVG chart primitives. Everything is drawn with classes (see style.css), never
 * inline styles, so the Content-Security-Policy holds; colours come from the design
 * tokens, so charts follow the light and dark themes. Series are told apart by line
 * pattern and labels as well as colour. Every label that can come from a user (team
 * names) goes through esc().
 */

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** A "nice" axis maximum at or above `max`, and a tick step that divides it. */
export function niceScale(max: number, ticks = 5): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  return { max: Math.ceil(max / step) * step, step };
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

export interface Series {
  label: string;
  /** Line style class: "s1" to "s6". */
  cls: string;
  points: { x: number; y: number }[];
}

export interface LineOptions {
  title: string;
  series: Series[];
  xLabel: string;
  yLabel: string;
  /** Horizontal reference lines (a target, a starting rating). */
  refs?: { y: number; label: string }[];
  /** Dots on the lines: wickets, say. */
  marks?: { x: number; y: number; label: string }[];
  yMin?: number;
  yMax?: number;
  xMax?: number;
  /** Write each series' name at the end of its line (needs room on the right). */
  endLabels?: boolean;
  /** Axis ticks at whole numbers only. */
  intX?: boolean;
  /** Where the x axis' ticks go, as a step. Default: chosen from the range. */
  xStep?: number;
}

const W = 640;
const H = 280;

function legend(items: { label: string; cls: string }[]): string {
  if (items.length < 2) return "";
  return `<ul class="legend">${items.map((s) => `<li><span class="sw ${s.cls}" aria-hidden="true"></span>${esc(s.label)}</li>`).join("")}</ul>`;
}

/** A line chart. */
export function lineChart(o: LineOptions): string {
  const all = o.series.flatMap((s) => s.points);
  if (all.length === 0) return "";
  const padL = 44;
  const padR = o.endLabels ? 118 : 16;
  const padT = 14;
  const padB = 40;
  const xs = all.map((p) => p.x);
  const xMax = o.xMax ?? Math.max(...xs, 1);
  const yLo = o.yMin ?? 0;
  let yHi = o.yMax ?? Math.max(...all.map((p) => p.y), ...(o.refs ?? []).map((r) => r.y), yLo + 1);
  const ys = niceScale(yHi - yLo, 5);
  yHi = yLo + ys.max;
  const X = (x: number): number => r1(padL + (x / xMax) * (W - padL - padR));
  const Y = (y: number): number => r1(H - padB - ((y - yLo) / (yHi - yLo)) * (H - padT - padB));

  let grid = "";
  for (let v = yLo; v <= yHi + 1e-9; v += ys.step) {
    grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${padL - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  const xTicks = niceScale(xMax, 8);
  const xStep = o.xStep ?? (o.intX ? Math.max(1, Math.ceil(xTicks.step)) : xTicks.step);
  for (let v = 0; v <= xMax + 1e-9; v += xStep) {
    grid += `<text class="ax" x="${X(v)}" y="${H - padB + 16}" text-anchor="middle">${r1(v)}</text>`;
  }
  const refs = (o.refs ?? [])
    .map((r) => `<line class="ref" x1="${padL}" x2="${W - padR}" y1="${Y(r.y)}" y2="${Y(r.y)}"/><text class="ax ref" x="${W - padR - 4}" y="${Y(r.y) - 5}" text-anchor="end">${esc(r.label)}</text>`)
    .join("");
  const lines = o.series
    .map((s) => {
      if (s.points.length === 0) return "";
      const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.x)} ${Y(p.y)}`).join("");
      const last = s.points[s.points.length - 1]!;
      const end = o.endLabels ? `<text class="ax endlabel ${s.cls}" x="${X(last.x) + 6}" y="${Y(last.y) + 4}">${esc(truncate(s.label, 16))}</text>` : "";
      return `<path class="line ${s.cls}" d="${d}"/>${end}`;
    })
    .join("");
  const marks = (o.marks ?? [])
    .map((m) => `<circle class="mark" cx="${X(m.x)}" cy="${Y(m.y)}" r="4.5"><title>${esc(m.label)}</title></circle>`)
    .join("");
  const aria = `${o.title}. ${o.series.map((s) => s.label).join(", ")}.`;
  return `<figure class="figure"><figcaption>${esc(o.title)}</figcaption>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">
      ${grid}${refs}${lines}${marks}
      <text class="ax" x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>
      <text class="ax" x="12" y="${(padT + H - padB) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(padT + H - padB) / 2})">${esc(o.yLabel)}</text>
    </svg>${o.endLabels ? "" : legend(o.series)}</figure>`;
}

export interface BarGroup {
  label: string;
  values: number[];
  /** Wickets per series in this group, drawn as dots above the bar. */
  wickets?: number[];
}

export interface BarOptions {
  title: string;
  groups: BarGroup[];
  series: { label: string; cls: string }[];
  xLabel: string;
  yLabel: string;
  /** Print every n-th group label. */
  labelEvery?: number;
}

/** Vertical bars, grouped by category (a Manhattan: runs per over, a dot for each wicket). */
export function barChart(o: BarOptions): string {
  if (o.groups.length === 0) return "";
  const padL = 44;
  const padR = 16;
  const padT = 22;
  const padB = 40;
  const top = Math.max(...o.groups.flatMap((g) => g.values), 1);
  const ys = niceScale(top, 5);
  const Y = (y: number): number => r1(H - padB - (y / ys.max) * (H - padT - padB));
  const slot = (W - padL - padR) / o.groups.length;
  const n = o.series.length;
  const bw = Math.max(2, Math.min(22, (slot * 0.8) / n));
  let grid = "";
  for (let v = 0; v <= ys.max + 1e-9; v += ys.step) {
    grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${padL - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  const every = o.labelEvery ?? Math.max(1, Math.ceil(o.groups.length / 20));
  const bars = o.groups
    .map((g, gi) => {
      const x0 = padL + gi * slot + (slot - bw * n) / 2;
      const label = gi % every === 0 ? `<text class="ax" x="${r1(padL + gi * slot + slot / 2)}" y="${H - padB + 16}" text-anchor="middle">${esc(g.label)}</text>` : "";
      const rects = g.values
        .map((v, si) => {
          const h = r1(((H - padB) - Y(v)));
          const x = r1(x0 + si * bw);
          const wk = g.wickets?.[si] ?? 0;
          const dots = Array.from({ length: Math.min(wk, 4) }, (_, k) => `<circle class="mark" cx="${r1(x + bw / 2)}" cy="${Y(v) - 7 - k * 9}" r="3.5"/>`).join("");
          return `<rect class="bar ${o.series[si]!.cls}" x="${x}" y="${Y(v)}" width="${r1(bw - 1)}" height="${Math.max(0, h)}"><title>${esc(`${o.series[si]!.label}, ${g.label}: ${v} run${v === 1 ? "" : "s"}${wk ? `, ${wk} wicket${wk === 1 ? "" : "s"}` : ""}`)}</title></rect>${dots}`;
        })
        .join("");
      return rects + label;
    })
    .join("");
  const aria = `${o.title}. ${o.series.map((s) => s.label).join(", ")}.`;
  return `<figure class="figure"><figcaption>${esc(o.title)}</figcaption>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">
      ${grid}${bars}
      <text class="ax" x="${(padL + W - padR) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>
      <text class="ax" x="12" y="${(padT + H - padB) / 2}" text-anchor="middle" transform="rotate(-90 12 ${(padT + H - padB) / 2})">${esc(o.yLabel)}</text>
    </svg>${legend(o.series)}</figure>`;
}

export interface HBarRow {
  label: string;
  value: number;
  /** Text at the end of the bar. */
  text?: string;
  cls?: string;
  /** Names the bar for assistive technology. */
  title?: string;
}

/**
 * Horizontal bars. With a `baseline` the bars grow left or right from it (Elo around
 * 1500); without one they all grow from zero.
 */
export function hBars(o: { title: string; rows: HBarRow[]; baseline?: number; unit?: string }): string {
  if (o.rows.length === 0) return "";
  const rowH = 26;
  const padL = 138;
  const padR = 56;
  const height = o.rows.length * rowH + 12;
  const base = o.baseline ?? 0;
  const span = Math.max(...o.rows.map((r) => Math.abs(r.value - base)), 1);
  const diverging = o.baseline !== undefined;
  const half = diverging ? (W - padL - padR) / 2 : W - padL - padR;
  const zeroX = diverging ? padL + half : padL;
  const rows = o.rows
    .map((r, i) => {
      const y = 6 + i * rowH;
      const len = r1((Math.abs(r.value - base) / span) * half);
      const x = diverging && r.value < base ? zeroX - len : zeroX;
      const textX = diverging && r.value < base ? x - 4 : x + len + 4;
      const anchor = diverging && r.value < base ? "end" : "start";
      return `<text class="ax rowlabel" x="${padL - 8}" y="${y + 15}" text-anchor="end">${esc(truncate(r.label, 20))}</text>
        <rect class="bar ${r.cls ?? "s1"}" x="${x}" y="${y + 3}" width="${Math.max(1, len)}" height="${rowH - 8}"><title>${esc(r.title ?? `${r.label}: ${r.text ?? r.value}`)}</title></rect>
        <text class="ax val" x="${r1(textX)}" y="${y + 15}" text-anchor="${anchor}">${esc(r.text ?? String(r.value))}</text>`;
    })
    .join("");
  const axis = `<line class="axis" x1="${zeroX}" x2="${zeroX}" y1="2" y2="${height - 4}"/>`;
  return `<figure class="figure"><figcaption>${esc(o.title)}</figcaption>
    <svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(o.title)}">${axis}${rows}</svg></figure>`;
}

/** Colour classes for each kind of ball, lightest (a dot) to strongest (a six), with a wicket apart. */
const MIX_CLS: Record<string, string> = { dot: "m0", "1": "m1", "2": "m2", "3": "m3", "4": "m4", "5": "m5", "6": "m6", W: "mw" };
const MIX_NAME: Record<string, string> = { dot: "Dot", "1": "1", "2": "2", "3": "3", "4": "Four", "5": "5", "6": "Six", W: "Wicket" };

/** One stacked bar per innings showing what share of balls were dots, singles, fours, sixes and wickets. */
export function mixChart(title: string, rows: { label: string; mix: Record<string, number>; balls: number }[], order: readonly string[]): string {
  const padL = 138;
  const padR = 16;
  const rowH = 36;
  const height = rows.length * rowH + 12;
  const keys = order.filter((k) => rows.some((r) => (r.mix[k] ?? 0) > 0));
  const body = rows
    .map((r, i) => {
      const y = 6 + i * rowH;
      let x = padL;
      const segs = keys
        .map((k) => {
          const c = r.mix[k] ?? 0;
          if (!c || !r.balls) return "";
          const w = r1((c / r.balls) * (W - padL - padR));
          const seg = `<rect class="seg ${MIX_CLS[k] ?? "m1"}" x="${r1(x)}" y="${y + 3}" width="${w}" height="${rowH - 10}"><title>${esc(`${r.label}: ${MIX_NAME[k] ?? k} ${c} (${Math.round((c / r.balls) * 100)}%)`)}</title></rect>${
            w >= 22 ? `<text class="segtext ${MIX_CLS[k] ?? "m1"}" x="${r1(x + w / 2)}" y="${y + rowH / 2 + 4}" text-anchor="middle">${c}</text>` : ""
          }`;
          x += w;
          return seg;
        })
        .join("");
      return `<text class="ax rowlabel" x="${padL - 8}" y="${y + rowH / 2 + 3}" text-anchor="end">${esc(truncate(r.label, 20))}</text>${segs}`;
    })
    .join("");
  const key = keys.map((k) => `<li><span class="sw seg ${MIX_CLS[k] ?? "m1"}" aria-hidden="true"></span>${esc(MIX_NAME[k] ?? k)}</li>`).join("");
  return `<figure class="figure"><figcaption>${esc(title)}</figcaption>
    <svg class="chart" viewBox="0 0 ${W} ${height}" role="img" aria-label="${esc(title)}">${body}</svg>
    <ul class="legend">${key}</ul></figure>`;
}

/** Every match as a dot: the first innings' score across, the chase's up. Above the diagonal the chasers won. */
export function chaseMap(title: string, points: { first: number; second: number; text: string }[]): string {
  if (points.length === 0) return "";
  const size = 300;
  const pad = 40;
  const top = niceScale(Math.max(...points.flatMap((p) => [p.first, p.second]), 20), 5);
  const P = (v: number): number => r1(pad + (v / top.max) * (size - pad - 14));
  const Yp = (v: number): number => r1(size - pad - (v / top.max) * (size - pad - 14));
  let grid = "";
  for (let v = 0; v <= top.max + 1e-9; v += top.step) {
    grid += `<line class="grid" x1="${pad}" x2="${size - 14}" y1="${Yp(v)}" y2="${Yp(v)}"/><text class="ax" x="${pad - 6}" y="${Yp(v) + 4}" text-anchor="end">${v}</text>
      <text class="ax" x="${P(v)}" y="${size - pad + 16}" text-anchor="middle">${v}</text>`;
  }
  const dots = points
    .slice(0, 600)
    .map((p) => `<circle class="dotpt ${p.second > p.first ? "chased" : p.second < p.first ? "defended" : "tied"}" cx="${P(p.first)}" cy="${Yp(p.second)}" r="4"><title>${esc(p.text)}</title></circle>`)
    .join("");
  return `<figure class="figure"><figcaption>${esc(title)}</figcaption>
    <svg class="chart square" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(title)}">
      ${grid}<line class="ref" x1="${P(0)}" y1="${Yp(0)}" x2="${P(top.max)}" y2="${Yp(top.max)}"/>
      ${dots}
      <text class="ax" x="${(pad + size - 14) / 2}" y="${size - 4}" text-anchor="middle">First innings (runs)</text>
      <text class="ax" x="10" y="${(size - pad) / 2}" text-anchor="middle" transform="rotate(-90 10 ${(size - pad) / 2})">Second innings (runs)</text>
    </svg>
    <ul class="legend"><li><span class="sw dotpt chased" aria-hidden="true"></span>Chase won</li><li><span class="sw dotpt defended" aria-hidden="true"></span>Total defended</li><li><span class="sw dotpt tied" aria-hidden="true"></span>Tied</li></ul></figure>`;
}
