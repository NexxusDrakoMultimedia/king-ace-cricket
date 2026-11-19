// SPDX-FileCopyrightText: 2026 Nexxus Drako Multimedia
// SPDX-License-Identifier: GPL-3.0-or-later

// The Nexxus Drako Multimedia brand icon set (design system, assets/Icons): 24px grid,
// 2px round strokes, no fills. Drawn in the surrounding text colour (currentColor).

const ICONS = {
  "arrow-right": "<path d=\"M5 12h14\"/><path d=\"M13 6l6 6-6 6\"/>",
  "book": "<path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z\"/><path d=\"M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5\"/>",
  "calendar": "<path d=\"M3 6h18v15H3z\"/><path d=\"M3 10h18\"/><path d=\"M8 3v4M16 3v4\"/>",
  "check": "<path d=\"M5 12l5 5 9-10\"/>",
  "clock": "<path d=\"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z\"/><path d=\"M12 7v5l3 2\"/>",
  "close": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
  "code": "<path d=\"M8 7l-5 5 5 5\"/><path d=\"M16 7l5 5-5 5\"/>",
  "download": "<path d=\"M12 4v11\"/><path d=\"M7 10l5 5 5-5\"/><path d=\"M4 20h16\"/>",
  "error": "<path d=\"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z\"/><path d=\"M9 9l6 6M15 9l-6 6\"/>",
  "external": "<path d=\"M14 4h6v6\"/><path d=\"M20 4l-9 9\"/><path d=\"M18 14v6H4V6h6\"/>",
  "flag": "<path d=\"M5 21V4\"/><path d=\"M5 4h14l-3 4.5 3 4.5H5\"/>",
  "gamepad": "<path d=\"M7 6h10a5 5 0 0 1 4.9 6l-.7 3.5a2.5 2.5 0 0 1-4.3 1.2L15 15H9l-1.9 1.7a2.5 2.5 0 0 1-4.3-1.2L2.1 12A5 5 0 0 1 7 6z\"/><path d=\"M7 10v3M5.5 11.5h3\"/><path d=\"M16 10.5h.01M18 12.5h.01\"/>",
  "heart": "<path d=\"M12 20s-7-4.35-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.65-9 9-9 9z\"/>",
  "info": "<path d=\"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z\"/><path d=\"M12 11v6\"/><path d=\"M12 7.5v.01\"/>",
  "link": "<path d=\"M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1\"/><path d=\"M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1\"/>",
  "mail": "<path d=\"M3 5h18v14H3z\"/><path d=\"M3 6l9 7 9-7\"/>",
  "menu": "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
  "mic": "<path d=\"M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z\"/><path d=\"M19 10v2a7 7 0 0 1-14 0v-2\"/><path d=\"M12 19v3\"/>",
  "music": "<path d=\"M9 18V5l12-2v13\"/><path d=\"M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z\"/><path d=\"M18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z\"/>",
  "pen": "<path d=\"M4 20l4-1 11-11-3-3L5 16z\"/><path d=\"M14 6l3 3\"/>",
  "play": "<path d=\"M8 5v14l11-7z\"/>",
  "radio": "<path d=\"M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z\"/><path d=\"M12 12v9\"/><path d=\"M8.5 6.5a5 5 0 0 0 0 7\"/><path d=\"M15.5 6.5a5 5 0 0 1 0 7\"/><path d=\"M5.5 3.5a9 9 0 0 0 0 13\"/><path d=\"M18.5 3.5a9 9 0 0 1 0 13\"/>",
  "search": "<path d=\"M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z\"/><path d=\"M20 20l-4-4\"/>",
  "star": "<path d=\"M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.5 2.9 1-6.1L3.2 9.5l6.1-.9z\"/>",
  "steering-wheel": "<path d=\"M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z\"/><path d=\"M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z\"/><path d=\"M3 12h7M14 12h7M12 14v7\"/>",
  "users": "<path d=\"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z\"/><path d=\"M2 21a7 7 0 0 1 14 0\"/><path d=\"M16 3.5a4 4 0 0 1 0 7\"/><path d=\"M22 21a7 7 0 0 0-4-6.3\"/>",
  "warning": "<path d=\"M12 3l10 18H2z\"/><path d=\"M12 10v4\"/><path d=\"M12 17.5v.01\"/>"
};

export type IconName = keyof typeof ICONS;

/** An inline SVG icon. Pass `label` for a standalone icon; otherwise it is decorative next to a word. */
export function icon(name: IconName, size = 20, label?: string): string {
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, "&quot;")}"` : 'aria-hidden="true"';
  return `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${ICONS[name]}</svg>`;
}
