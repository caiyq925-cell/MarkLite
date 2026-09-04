export interface ThemeDef {
  id: string;
  name: string;
  dark: boolean;
}

/** Auto-generated from src/theme/*.theme.css — do not edit manually. */
export const THEMES: ThemeDef[] = [
  { id: "light", name: "Default", dark: false },
  { id: "dark", name: "Dark", dark: true },
  { id: "one-dark", name: "One Dark", dark: true },
  { id: "graphite", name: "Graphite", dark: false },
  { id: "ulysses", name: "Ulysses", dark: false },
  { id: "material-dark", name: "Material Dark", dark: true },
  { id: "ayu-dark", name: "Ayu Dark", dark: true },
  { id: "ayu-light", name: "Ayu Light", dark: false },
  { id: "ayu-mirage", name: "Ayu Mirage", dark: true },
  { id: "catppuccin-latte", name: "Catppuccin Latte", dark: false },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", dark: true },
  { id: "cyberdream", name: "Cyberdream", dark: true },
  { id: "dracula", name: "Dracula", dark: true },
  { id: "everforest-dark", name: "Everforest Dark", dark: true },
  { id: "everforest-light", name: "Everforest Light", dark: false },
  { id: "gruvbox-dark", name: "Gruvbox Dark", dark: true },
  { id: "gruvbox-light", name: "Gruvbox Light", dark: false },
  { id: "horizon-dark", name: "Horizon Dark", dark: true },
  { id: "kanagawa", name: "Kanagawa", dark: true },
  { id: "monokai-pro", name: "Monokai Pro", dark: true },
  { id: "nightfox", name: "Nightfox", dark: true },
  { id: "nord", name: "Nord", dark: true },
  { id: "oxocarbon-dark", name: "Oxocarbon Dark", dark: true },
  { id: "palenight", name: "Palenight", dark: true },
  { id: "rose-pine-dawn", name: "Rose Pine Dawn", dark: false },
  { id: "rose-pine-moon", name: "Rose Pine Moon", dark: true },
  { id: "rose-pine", name: "Rose Pine", dark: true },
  { id: "solarized-dark", name: "Solarized Dark", dark: true },
  { id: "solarized-light", name: "Solarized Light", dark: false },
  { id: "synthwave-84", name: "Synthwave 84", dark: true },
  { id: "tokyo-night-light", name: "Tokyo Night Light", dark: false },
  { id: "tokyo-night-storm", name: "Tokyo Night Storm", dark: true },
  { id: "tokyo-night", name: "Tokyo Night", dark: true },
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
