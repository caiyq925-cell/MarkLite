import { describe, expect, it } from "vitest";
import { extractHeadings, slugify } from "./toc";

describe("toc", () => {
  it("extracts atx and setext headings in order", () => {
    const src = ["# One", "", "Two", "====", "", "```", "# not", "```", "", "### Three"].join("\n");
    const hs = extractHeadings(src);
    expect(hs.map((h) => h.text)).toEqual(["One", "Two", "Three"]);
    expect(hs[0].id).toBe(slugify("One"));
  });
});
