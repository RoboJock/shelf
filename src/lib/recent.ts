const RECENT_KEY = "shelf-recent-v1";
const RECENT_LIMIT = 8;

export interface RecentSearch {
  text: string;
  at: number;
}

interface RecentStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecent(store: Pick<RecentStore, "getItem">): RecentSearch[] {
  try {
    const parsed = JSON.parse(store.getItem(RECENT_KEY) ?? "");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
      const at = "at" in item && typeof item.at === "number" ? item.at : 0;
      return text ? [{ text, at }] : [];
    }).slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function rememberSearch(text: string, store: RecentStore, at = Date.now()): RecentSearch[] {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 80);
  const current = readRecent(store);
  if (clean.length < 2) return current;
  const next = [{ text: clean, at }, ...current.filter((item) => item.text.toLowerCase() !== clean.toLowerCase())].slice(0, RECENT_LIMIT);
  store.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}
