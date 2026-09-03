import { describe, it, expect } from "vitest";
import { scanEntities } from "./entity-lex";

describe("entity lex scanner", () => {
  it("should detect PascalCase class names", () => {
    const text = "OrderBillingService is a class";
    const hits = scanEntities(text, "aggressive");
    expect(hits.some((h) => h.kind === "class" && h.content === "OrderBillingService")).toBe(true);
  });

  it("should detect camelCase method names", () => {
    const text = "Call getUserById to retrieve user";
    const hits = scanEntities(text, "aggressive");
    expect(hits.some((h) => h.kind === "method" && h.content === "getUserById")).toBe(true);
  });

  it("should detect snake_case table names", () => {
    const text = "Query t_se_bu_invoice_if_log table";
    const hits = scanEntities(text, "aggressive");
    expect(hits.some((h) => h.kind === "table" && h.content === "t_se_bu_invoice_if_log")).toBe(true);
  });

  it("should not flag common short words", () => {
    const text = "Apple is a company";
    const hits = scanEntities(text, "aggressive");
    expect(hits.some((h) => h.content === "Apple")).toBe(false);
  });

  it("should skip words below length threshold", () => {
    const text = "Get the data";
    const hits = scanEntities(text, "aggressive");
    expect(hits.some((h) => h.content === "Get")).toBe(false);
  });

  it("should respect blacklist", () => {
    const text = "OrderBillingService and Apple";
    const hits = scanEntities(text, "aggressive", ["Apple"]);
    expect(hits.some((h) => h.content === "Apple")).toBe(false);
    expect(hits.some((h) => h.content === "OrderBillingService")).toBe(true);
  });

  it("should be conservative in conservative mode", () => {
    const text = "OrderBillingService handles orders";
    const hitsAgg = scanEntities(text, "aggressive");
    const hitsCons = scanEntities(text, "conservative");
    expect(hitsCons.length).toBeLessThanOrEqual(hitsAgg.length);
  });

  it("should not match without context in conservative mode", () => {
    const text = "I visited Apple Store yesterday";
    const hits = scanEntities(text, "conservative");
    expect(hits.some((h) => h.content === "Apple")).toBe(false);
    expect(hits.some((h) => h.content === "Store")).toBe(false);
  });
});
