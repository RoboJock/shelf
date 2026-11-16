import { readSearch, type LibraryHit } from "./books";

const VOWELS = "aeiouy";
const VOWEL_PAIRS = ["ae", "ea", "ei", "ie", "iy", "yi", "ao", "oa", "ou", "uo", "ay", "ya", "ey", "ye"];

export function queryWords(value: string): string[] {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? [];
}

function addWord(words: string[], seen: Set<string>, word: string) {
  if (word.length < 3 || seen.has(word)) return;
  seen.add(word);
  words.push(word);
}

/** Spellings a letter or two away from a title or author word. */
export function nearWords(word: string): string[] {
  const value = word.toLowerCase();
  if (value.length < 4 || value.length > 24 || !/^[a-z]+$/.test(value)) return [];
  const words: string[] = [];
  const seen = new Set<string>([value]);
  for (let i = 0; i < value.length - 1; i++) {
    addWord(words, seen, value.slice(0, i) + value[i + 1] + value[i] + value.slice(i + 2));
  }
  for (let i = value.length; i >= 0; i--) addWord(words, seen, value.slice(0, i) + "e" + value.slice(i));
  const vowelAt = [...value].flatMap((char, index) => VOWELS.includes(char) ? [index] : []);
  const last = vowelAt.slice(-2);
  if (last.length === 2) {
    for (const pair of VOWEL_PAIRS) {
      const chars = value.split("");
      chars[last[0]] = pair[0];
      chars[last[1]] = pair[1];
      addWord(words, seen, chars.join(""));
    }
  }
  for (let i = Math.max(0, value.length - 3); i < value.length; i++) {
    addWord(words, seen, value.slice(0, i) + value.slice(i + 1));
  }
  return words.slice(0, 28);
}

export function nearQueries(query: string): string[] {
  const words = queryWords(query);
  const queries: string[] = [];
  const seen = new Set<string>([words.join(" ")]);
  words.forEach((word, index) => {
    for (const near of nearWords(word)) {
      const next = words.slice();
      next[index] = near;
      const phrase = next.join(" ");
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      queries.push(phrase);
    }
  });
  return queries.slice(0, 28);
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function distance(left: string, right: string): number {
  const a = left.slice(0, 40);
  const b = right.slice(0, 40);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = a[i - 1] === b[j - 1] ? previous : Math.min(previous, row[j], row[j - 1]) + 1;
      previous = current;
    }
  }
  return row[b.length];
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  const score = 1 - distance(left, right) / Math.max(left.length, right.length);
  return score < 0 ? 0 : score;
}

export function matchScore(query: string, hit: LibraryHit): number {
  const words = queryWords(query);
  const title = normalize(hit.title);
  const author = normalize(hit.author);
  const both = `${title} ${author}`;
  let score = Math.max(similarity(words.join(" "), title), similarity(words.join(" "), author), similarity(words.join(" "), both));
  for (const word of words) {
    const tokens = both.split(" ").filter(Boolean);
    const best = tokens.reduce((high, token) => Math.max(high, similarity(word, token)), 0);
    score = Math.max(score, best);
    if (both.includes(word)) score = Math.max(score, 0.92);
  }
  return score;
}

export function rankHits(query: string, hits: LibraryHit[]): LibraryHit[] {
  const typed = queryWords(query).join(" ");
  const titleCloseness = (hit: LibraryHit) => similarity(typed, normalize(hit.title));
  return [...hits].sort((a, b) => {
    const score = matchScore(query, b) - matchScore(query, a);
    if (Math.abs(score) > 0.02) return score;
    const title = titleCloseness(b) - titleCloseness(a);
    if (Math.abs(title) > 0.02) return title;
    return a.title.length - b.title.length;
  });
}

export function keepsTypedWords(query: string, hits: LibraryHit[]): boolean {
  const words = queryWords(query).filter((word) => word.length >= 4);
  if (words.length === 0) return hits.length > 0;
  return hits.some((hit) => {
    const text = normalize(`${hit.title} ${hit.author}`);
    return words.every((word) => text.includes(word));
  });
}

async function libraryHits(query: string, limit: number, signal: AbortSignal | undefined, fetchImpl: typeof fetch): Promise<LibraryHit[]> {
  const response = await fetchImpl(`https://openlibrary.org/search.json?${new URLSearchParams({
    q: query,
    limit: String(limit),
    fields: "key,title,author_name,cover_i,first_publish_year",
  })}`, { signal });
  if (!response.ok) throw new Error("Open Library did not answer. Try the search again.");
  return readSearch(await response.json(), limit);
}

export async function findBooks(
  query: string,
  limit: number,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  notify?: (result: { hits: LibraryHit[]; close: boolean }) => void,
): Promise<{ hits: LibraryHit[]; close: boolean }> {
  const typed = query.trim();
  if (!typed) return { hits: [], close: false };
  const direct = await libraryHits(typed, limit, signal, fetchImpl);
  const rankedDirect = rankHits(typed, direct).slice(0, limit);
  const spelled = rankedDirect.length > 0 && !keepsTypedWords(typed, direct);
  const preliminary = { hits: rankedDirect, close: spelled };
  notify?.(preliminary);
  const phrases = nearQueries(typed);
  if (phrases.length === 0 || (rankedDirect.length > 0 && !spelled)) return preliminary;
  let extra: LibraryHit[] = [];
  const clause = phrases.map((phrase) => phrase.includes(" ") ? `(${phrase.split(" ").join(" AND ")})` : phrase).join(" OR ");
  try {
    extra = await libraryHits(clause, limit, signal, fetchImpl);
  } catch (error) {
    if (signal?.aborted) throw error;
    return preliminary;
  }
  const seen = new Set<string>();
  const merged = [...direct, ...extra].filter((hit) => {
    if (seen.has(hit.id)) return false;
    seen.add(hit.id);
    return matchScore(typed, hit) >= 0.55;
  });
  const hits = rankHits(typed, merged.length > 0 ? merged : direct).slice(0, limit);
  const result = { hits, close: hits.length > 0 && !keepsTypedWords(typed, direct) };
  notify?.(result);
  return result;
}
