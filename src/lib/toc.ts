import type { Heading } from "./types";

const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const SETEXT = /^(=+|-+)\s*$/;

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export function extractHeadings(source: string): Heading[] {
  const lines = source.split("\n");
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const atx = ATX.exec(line);
    if (atx) {
      headings.push(makeHeading(Number(atx[1].length), atx[2], i, used));
      continue;
    }
    if (i + 1 < lines.length && SETEXT.test(lines[i + 1]) && line.trim()) {
      const level = lines[i + 1].trim().startsWith("=") ? 1 : 2;
      headings.push(makeHeading(level, line.trim(), i, used));
    }
  }
  return headings;
}

function makeHeading(
  level: number,
  text: string,
  sourceLine: number,
  used: Map<string, number>,
): Heading {
  let id = slugify(text) || "section";
  const n = used.get(id) ?? 0;
  used.set(id, n + 1);
  if (n > 0) id = `${id}-${n}`;
  return { level, text, id, sourceLine };
}
