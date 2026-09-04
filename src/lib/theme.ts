export interface ThemeDef {
  id: string;
  name: string;
  dark: boolean;
}

/** 内置命名主题（与 src/themes.css 中的 data-theme 值一一对应） */
export const THEMES: ThemeDef[] = [
  { id: "light", name: "Default", dark: false },
  { id: "dark", name: "Dark", dark: true },
  { id: "one-dark", name: "One Dark", dark: true },
  { id: "graphite", name: "Graphite", dark: false },
  { id: "ulysses", name: "Ulysses", dark: false },
  { id: "material-dark", name: "Material Dark", dark: true },
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
