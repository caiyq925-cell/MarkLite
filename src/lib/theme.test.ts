import { describe, it, expect } from "vitest";
import {
  THEMES,
  ACCENTS,
  isTheme,
  isDarkTheme,
  effectiveTheme,
  accentForeground,
} from "./theme";

describe("theme registry", () => {
  it("ships many named themes from src/theme/", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(20);
    // Verify a few key themes are present
    expect(THEMES.map((t) => t.id)).toContain("light");
    expect(THEMES.map((t) => t.id)).toContain("dark");
    expect(THEMES.map((t) => t.id)).toContain("catppuccin-mocha");
    expect(THEMES.map((t) => t.id)).toContain("tokyo-night");
  });

  it("recognizes known and unknown theme ids", () => {
    expect(isTheme("material-dark")).toBe(true);
    expect(isTheme("catppuccin-mocha")).toBe(true);
    expect(isTheme("nope")).toBe(false);
  });

  it("flags dark themes", () => {
    expect(isDarkTheme("light")).toBe(false);
    expect(isDarkTheme("graphite")).toBe(false);
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("one-dark")).toBe(true);
    expect(isDarkTheme("catppuccin-mocha")).toBe(true);
    expect(isDarkTheme("bogus")).toBe(false);
  });
});

describe("effectiveTheme", () => {
  it("resolves follow-system to light/dark by OS preference", () => {
    // When following system, picks first matching light or dark theme
    const lightTheme = THEMES.find((t) => !t.dark)?.id ?? "light";
    const darkTheme = THEMES.find((t) => t.dark)?.id ?? "dark";
    expect(effectiveTheme("one-dark", true, false)).toBe(lightTheme);
    expect(effectiveTheme("one-dark", true, true)).toBe(darkTheme);
  });

  it("keeps the selected theme when not following system", () => {
    expect(effectiveTheme("one-dark", false, false)).toBe("one-dark");
    expect(effectiveTheme("graphite", false, true)).toBe("graphite");
    expect(effectiveTheme("catppuccin-mocha", false, false)).toBe("catppuccin-mocha");
  });

  it("falls back to light for unknown ids", () => {
    expect(effectiveTheme("bogus", false, true)).toBe("light");
  });
});

describe("accentForeground", () => {
  it("returns white for dark accents", () => {
    expect(accentForeground("#B45F3A")).toBe("#FFFFFF");
    expect(accentForeground("#3A7AB4")).toBe("#FFFFFF");
  });

  it("returns dark for light accents", () => {
    expect(accentForeground("#E8A27A")).toBe("#1E1A17");
    expect(accentForeground("#FF8A65")).toBe("#1E1A17");
  });

  it("falls back to white for invalid input", () => {
    expect(accentForeground("not-a-color")).toBe("#FFFFFF");
  });

  it("accepts hex with or without the leading #", () => {
    expect(accentForeground("3A7AB4")).toBe("#FFFFFF");
  });

  it("provides a usable preset palette", () => {
    expect(ACCENTS.length).toBeGreaterThanOrEqual(6);
    for (const a of ACCENTS) {
      expect(accentForeground(a.value)).toMatch(/^#(1E1A17|FFFFFF)$/);
    }
  });
});
