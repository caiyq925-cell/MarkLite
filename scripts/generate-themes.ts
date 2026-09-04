/**
 * Theme generator — scans src/theme/*.theme.css and generates:
 *   1. MarkLite application-layer CSS rules appended to src/themes.css
 *   2. TypeScript theme list for src/lib/theme.ts
 *
 * Run: npm run themes
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";

const THEME_DIR = join(import.meta.dirname, "../src/theme");
const THEMES_CSS = join(import.meta.dirname, "../src/themes.css");
const THEME_TS = join(import.meta.dirname, "../src/lib/theme.ts");

// ---------- helpers ----------

/** Parse a CSS value to hex #RRGGBB, handling rgb(), rgba(), #hex, transparent */
function toHex(value: string): string | null {
  value = value.trim();
  if (value.startsWith("#")) return value.slice(0, 7).padEnd(7, "0");
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (m) {
    const [r, g, b] = m.slice(1, 4).map(Number);
    return "#" + [[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")];
  }
  return null;
}

/** Luminance-based brightness heuristic: darker than midpoint → dark theme */
function isDark(hex: string | null): boolean {
  if (!hex) return false;
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}

/** Luminance → fg color on bg (pure black or pure white for contrast) */
function contrastFg(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.5 ? "#1E1A17" : "#FFFFFF";
}

function extractVar(content: string, name: string): string | null {
  const re = new RegExp(`--${name}:\\s*([^;]+)`, "i");
  const m = content.match(re);
  return m?.[1]?.trim() ?? null;
}

function extractColorVar(content: string, name: string): string | null {
  const raw = extractVar(content, name);
  return raw ? toHex(raw) : null;
}

// ---------- collect themes ----------

const files = readdirSync(THEME_DIR)
  .filter((f) => f.endsWith(".theme.css"))
  .sort();

interface ParsedTheme {
  id: string;
  name: string;
  dark: boolean;
  cssBlock: string;
}

const themes: ParsedTheme[] = [];
// Pre-existing handcrafted themes — include them in the list but don't regenerate their CSS
const HANDCRAFTED = new Set(["light", "dark", "one-dark", "graphite", "ulysses", "material-dark"]);

// Map handcrafted theme ids to their known properties (kept in sync with themes.css)
const HANDCRAFTED_META: Record<string, { name: string; dark: boolean }> = {
  light:   { name: "Default",       dark: false },
  dark:    { name: "Dark",          dark: true  },
  "one-dark": { name: "One Dark",   dark: true  },
  graphite: { name: "Graphite",     dark: false },
  ulysses:  { name: "Ulysses",      dark: false },
  "material-dark": { name: "Material Dark", dark: true },
};

// Add handcrafted themes to the list (CSS already exists in themes.css manually)
for (const [id, meta] of Object.entries(HANDCRAFTED_META)) {
  themes.push({ id, name: meta.name, dark: meta.dark, cssBlock: "" });
}

for (const file of files) {
  const id = basename(file, ".theme.css");
  if (HANDCRAFTED.has(id)) continue; // skip — already in the list above
  // Display name: use folder name directly (e.g. "catppuccin-mocha" → "Catppuccin Mocha")
  const name = id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const content = readFileSync(join(THEME_DIR, file), "utf-8");

  // Extract Monaco editor variables
  const bgColor = extractColorVar(content, "editorBgColor");
  const fgColor = extractColorVar(content, "editorColor");
  const accentRaw = extractVar(content, "themeColor");
  const accentHex = toHex(accentRaw ?? "");
  const codeBg = extractColorVar(content, "codeBlockBgColor");

  const dark = isDark(bgColor);
  const fg = fgColor ?? (dark ? "#cdd6f4" : "#2C2A28");
  const accent = accentHex ?? (dark ? "#89b4fa" : "#B45F3A");
  const codeBgVal = codeBg ?? (dark ? "#313244" : "#F6F8FA");
  const bgVal = bgColor ?? (dark ? "#1e1e2e" : "#FCF9F6");

  // Auto-derive muted from fg
  const muted = dark
    ? `rgba(${parseInt(fg.slice(1, 3), 16)}, ${parseInt(fg.slice(3, 5), 16)}, ${parseInt(fg.slice(5, 7), 16)}, 0.5)`
    : `rgba(${parseInt(fg.slice(1, 3), 16)}, ${parseInt(fg.slice(3, 5), 16)}, ${parseInt(fg.slice(5, 7), 16)}, 0.5)`;

  // Accent foreground (white on dark, dark on light)
  const accentFg = contrastFg(accent);

  const borderAlpha = dark ? "rgba(255,255,255,0.1)" : "rgba(44,42,40,0.1)";
  const borderLight = dark ? "rgba(255,255,255,0.06)" : "rgba(44,42,40,0.06)";

  const cssBlock = `
/* ---- ${name} ---- */
:root[data-theme="${id}"] {
  color-scheme: ${dark ? "dark" : "light"};
  --bg: ${bgVal};
  --bg-elev: ${dark ? shiftBrightness(bgVal, 15) : shadeLight(bgVal, 8)};
  --text: ${fg};
  --muted: ${muted};
  --border: ${borderAlpha};
  --accent: ${accent};
  --accent-fg: ${accentFg};
  --preview-bg: ${bgVal};
  --code-bg: ${codeBgVal};
  --code-text: ${fg};
  --tab-active: ${dark ? shiftBrightness(bgVal, 12) : shadeLight(bgVal, 6)};
  --shadow: 0 1px 3px ${dark ? "rgb(0 0 0 / 40%)" : "rgb(45 36 30 / 8%)"};
  --selection-bg: ${dark ? "rgba(102,177,255,0.3)" : "rgba(180,95,58,0.2)"};
  --selection-text: ${contrastFg(accent)};
  --preview-text: ${fg};
  --preview-strong: ${dark ? "rgba(255,255,255,0.85)" : "#2F2823"};
  --preview-em: ${dark ? "rgba(255,255,255,0.6)" : "#6B5A4E"};
  --heading-border: ${borderLight};
  --h1-color: ${dark ? "rgba(255,255,255,0.85)" : fg};
  --h2-color: ${dark ? "rgba(255,255,255,0.82)" : fg};
  --h3-color: ${dark ? "rgba(255,255,255,0.8)" : fg};
  --h4-color: ${dark ? "rgba(255,255,255,0.78)" : fg};
  --h5-color: ${dark ? "rgba(255,255,255,0.76)" : fg};
  --h6-color: ${dark ? "rgba(255,255,255,0.74)" : fg};
  --inline-code-bg: ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"};
  --inline-code-border: ${borderLight};
  --inline-code-text: ${accent};
  --blockquote-bg: ${dark ? shiftBrightness(bgVal, 10) : shadeLight(bgVal, 5)};
  --blockquote-border: ${accent};
  --blockquote-text: ${dark ? "rgba(255,255,255,0.55)" : "rgba(44,42,40,0.7)"};
  --table-header-bg: ${dark ? shiftBrightness(bgVal, 10) : shadeLight(bgVal, 4)};
  --table-header-text: ${dark ? "rgba(255,255,255,0.85)" : fg};
  --table-border: ${dark ? "rgba(255,255,255,0.08)" : "rgba(44,42,40,0.12)"};
  --table-stripe: ${dark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"};
  --table-hover: ${dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"};
  --marker-color: ${accent};
  --hr-gradient: linear-gradient(to right, ${borderAlpha}, ${borderLight}, ${borderAlpha});
  --entity-class: ${dark ? "#E8A030" : "#C47A20"};
  --entity-table: ${dark ? "#4DB87A" : "#2E8B57"};
  --entity-method: ${dark ? "#5AAEE8" : "#1E6FA0"};
  --entity-aside: ${dark ? "rgba(255,255,255,0.4)" : "rgba(44,42,40,0.4)"};
  --inline-italic-zh: ${dark ? "#C49A6A" : "#7A5A3A"};
  --hljs-keyword: ${dark ? "#66d9ef" : "#0077aa"};
  --hljs-string: ${dark ? "#a6e22e" : "#669900"};
  --hljs-title: ${dark ? "#e6db74" : "#dd4a68"};
  --hljs-number: ${dark ? "#ae81ff" : "#990055"};
  --hljs-comment: ${dark ? "#708090" : "#708090"};
  --hljs-property: ${dark ? "#f92672" : "#990055"};
  --hljs-variable: ${dark ? "#fd971f" : "#ee9900"};
  --hljs-operator: ${dark ? "#e67e65" : "#9a6e3a"};
  --hljs-punctuation: ${dark ? "#f8f8f2" : "#999999"};
  --focus: ${accent};
  --preview-link: ${accent};
}
`;

  themes.push({ id, name, dark, cssBlock });
}

// ---------- colour helpers ----------

function shiftBrightness(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (n & 255) + amount));
  return "#" + [[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")];
}

function shadeLight(hex: string, amount: number): string {
  return shiftBrightness(hex, amount);
}

// ---------- update themes.css ----------

let themesCss = readFileSync(THEMES_CSS, "utf-8");

// Remove old generated block (between markers)
const GENERATED_START = "/* ---- AUTO-GENERATED: src/theme/ --- */";
const GENERATED_END = "/* ---- END AUTO-GENERATED --- */";
const startIdx = themesCss.indexOf(GENERATED_START);
const endIdx = themesCss.indexOf(GENERATED_END);
if (startIdx !== -1 && endIdx !== -1) {
  themesCss = themesCss.slice(0, startIdx) + themesCss.slice(endIdx + GENERATED_END.length);
}

// Append new generated block
const newBlock = `\n${GENERATED_START}\n` + themes.map((t) => t.cssBlock).join("\n") + `\n${GENERATED_END}\n`;
themesCss = themesCss.trimEnd() + newBlock;
writeFileSync(THEMES_CSS, themesCss, "utf-8");
console.log(`✓ Updated themes.css — ${themes.length} themes generated`);

// ---------- update theme.ts ----------

const themeEntries = themes.map((t) => `  { id: "${t.id}", name: "${t.name}", dark: ${t.dark} },`).join("\n");

const themeTs = `export interface ThemeDef {
  id: string;
  name: string;
  dark: boolean;
}

/** Auto-generated from src/theme/*.theme.css — do not edit manually. */
export const THEMES: ThemeDef[] = [
${themeEntries}
];

export interface AccentDef {
  name: string;
  value: string;
}

/** 预设强调色板 */
export const ACCENTS: AccentDef[] = [
  { name: "陶土橙", value: "#B45F3A" },
  { name: "蓝", value: "#3A7AB4" },
  { name: "青", value: "#2BA3A3" },
  { name: "绿", value: "#2E8B57" },
  { name: "紫", value: "#7A5AA4" },
  { name: "玫红", value: "#C0567A" },
  { name: "石墨", value: "#5A6B7A" },
];

export function isTheme(id: string): boolean {
  return THEMES.some((t) => t.id === id);
}

export function isDarkTheme(id: string): boolean {
  return THEMES.find((t) => t.id === id)?.dark ?? false;
}

/** 解析最终生效的主题 id（跟随系统时在 light/dark 之间选择） */
export function effectiveTheme(theme: string, followSystem: boolean, prefersDark: boolean): string {
  if (followSystem) return prefersDark ? "dark" : "light";
  return isTheme(theme) ? theme : "light";
}

/** 依据 WCAG 相对亮度返回强调色上的对比文字色（黑或白） */
export function accentForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#FFFFFF";
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.35 ? "#1E1A17" : "#FFFFFF";
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
`;

writeFileSync(THEME_TS, themeTs, "utf-8");
console.log(`✓ Updated theme.ts — ${themes.length} themes registered`);
console.log(`  Themes: ${themes.map((t) => t.id).join(", ")}`);
