import { describe, it, expect } from "vitest";
import type { AppConfig, EntityIntensity } from "./types";

describe("AppConfig", () => {
  it("should include new entity fields", () => {
    const cfg: AppConfig = {
      splitRatio: 0.5,
      tocVisible: true,
      blockRemoteImages: false,
      entityIntensity: "aggressive" as EntityIntensity,
      entityBlacklist: [],
    };
    expect(cfg.entityIntensity).toBe("aggressive");
    expect(Array.isArray(cfg.entityBlacklist)).toBe(true);
    expect(cfg.entityBlacklist.length).toBe(0);
  });

  it("should have conservative intensity option", () => {
    const cfg: AppConfig = {
      splitRatio: 0.5,
      tocVisible: true,
      blockRemoteImages: false,
      entityIntensity: "conservative" as EntityIntensity,
      entityBlacklist: [],
    };
    expect(cfg.entityIntensity).toBe("conservative");
  });

  it("should allow window config", () => {
    const cfg: AppConfig = {
      splitRatio: 0.5,
      tocVisible: true,
      blockRemoteImages: false,
      entityIntensity: "aggressive" as EntityIntensity,
      entityBlacklist: [],
      window: { x: 100, y: 200, w: 800, h: 600, maximized: false },
    };
    expect(cfg.window).toBeDefined();
    expect(cfg.window?.x).toBe(100);
  });

  it("should support old config format with defaults", () => {
    const old = { splitRatio: 0.5, tocVisible: true, blockRemoteImages: false };
    const cfg: AppConfig = { ...old, entityIntensity: "aggressive", entityBlacklist: [] };
    expect(cfg.entityIntensity).toBeDefined();
    expect(cfg.entityBlacklist).toBeDefined();
  });
});
