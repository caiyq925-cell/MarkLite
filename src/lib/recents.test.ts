import { describe, expect, it } from "vitest";
import { MAX_RECENTS, pushRecent, timeAgo } from "./recents";

describe("pushRecent", () => {
  it("adds new entry at front", () => {
    const list = pushRecent([], "D:\\docs\\a.md", 1000);
    expect(list).toEqual([{ path: "D:\\docs\\a.md", lastOpened: 1000 }]);
  });

  it("moves existing entry to front and refreshes time", () => {
    const list = pushRecent(
      [
        { path: "D:\\docs\\a.md", lastOpened: 100 },
        { path: "D:\\docs\\b.md", lastOpened: 200 },
      ],
      "D:\\docs\\a.md",
      300,
    );
    expect(list.map((e) => e.path)).toEqual(["D:\\docs\\a.md", "D:\\docs\\b.md"]);
    expect(list[0].lastOpened).toBe(300);
  });

  it("dedupes case-insensitively (Windows paths)", () => {
    const list = pushRecent([{ path: "D:\\DOCS\\a.md", lastOpened: 100 }], "d:\\docs\\a.md", 200);
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe("d:\\docs\\a.md");
  });

  it("caps the list at max entries", () => {
    let list: { path: string; lastOpened: number }[] = [];
    for (let i = 0; i < MAX_RECENTS + 3; i++) {
      list = pushRecent(list, `D:\\docs\\f${i}.md`, i);
    }
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0].path).toBe("D:\\docs\\f12.md");
    expect(list.at(-1)?.path).toBe("D:\\docs\\f3.md");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-05T12:00:00").getTime();

  it("formats within a minute", () => {
    expect(timeAgo(now - 5_000, now)).toBe("刚刚");
  });

  it("formats minutes and hours", () => {
    expect(timeAgo(now - 3 * 60_000, now)).toBe("3 分钟前");
    expect(timeAgo(now - 5 * 3_600_000, now)).toBe("5 小时前");
  });

  it("formats yesterday and days", () => {
    expect(timeAgo(now - 24 * 3_600_000, now)).toBe("昨天");
    expect(timeAgo(now - 3 * 24 * 3_600_000, now)).toBe("3 天前");
  });

  it("falls back to a date string beyond a week", () => {
    expect(timeAgo(new Date("2026-08-01T08:30:00").getTime(), now)).toBe("2026-08-01");
  });
});
