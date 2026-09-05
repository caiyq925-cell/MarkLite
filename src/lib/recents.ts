import type { RecentEntry } from "./types";

export const MAX_RECENTS = 10;

// Windows 路径大小写不敏感：去重时按小写比较，命中则置顶并刷新时间
export function pushRecent(
  list: RecentEntry[],
  path: string,
  now = Date.now(),
  max = MAX_RECENTS,
): RecentEntry[] {
  const key = path.toLowerCase();
  const rest = list.filter((e) => e.path.toLowerCase() !== key);
  return [{ path, lastOpened: now }, ...rest].slice(0, max);
}

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  const days = Math.floor(diff / day);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
