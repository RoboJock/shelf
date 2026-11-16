import { chooseGenre } from "./details";
import { readRelated, type RelatedBook } from "./details";

export interface ShelfInterest {
  genres: string[];
  authors: string[];
  savedIds: string[];
  savedTitles: string[];
  savedAuthors: string[];
}

export function collectInterests(books: { id: string; title: string; author: string; categories?: string | null }[]): ShelfInterest {
  const genres: string[] = [];
  const authors: string[] = [];
  for (const book of books) {
    const parts = (book.categories ?? "").split("·").map((part) => part.trim()).filter(Boolean);
    const genre = chooseGenre(parts);
    if (genre && !genres.includes(genre)) genres.push(genre);
    const author = book.author.trim();
    if (author && author.toLowerCase() !== "unknown" && !authors.some((name) => name.toLowerCase() === author.toLowerCase())) authors.push(author);
  }
  return {
    genres: genres.slice(0, 2),
    authors,
    savedIds: books.map((book) => book.id),
    savedTitles: books.map((book) => book.title.trim().toLowerCase()),
    savedAuthors: authors.map((author) => author.toLowerCase()),
  };
}

function plainTitle(title: string): string {
  return title.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
}

function repeats(title: string, chosen: RelatedBook[]): boolean {
  const next = plainTitle(title);
  if (next.length < 6) return false;
  return chosen.some((book) => {
    const prev = plainTitle(book.title);
    return prev === next || (prev.length > 8 && next.length > 8 && (prev.includes(next) || next.includes(prev)));
  });
}

function fresh(list: RelatedBook[], savedIds: Set<string>, savedTitles: Set<string>, chosen: RelatedBook[], limit: number): RelatedBook[] {
  const picked: RelatedBook[] = [];
  for (const book of list) {
    if (savedIds.has(book.id) || savedTitles.has(book.title.toLowerCase())) continue;
    if (chosen.some((item) => item.id === book.id) || picked.some((item) => item.id === book.id) || repeats(book.title, [...chosen, ...picked])) continue;
    picked.push(book);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function pickSuggestions(input: {
  genreBooks: RelatedBook[];
  authorBooks: RelatedBook[];
  savedIds: string[];
  savedTitles: string[];
  savedAuthors: string[];
}): { books: RelatedBook[]; authors: string[] } {
  const savedIds = new Set(input.savedIds);
  const savedTitles = new Set(input.savedTitles.map((title) => title.toLowerCase()));
  const byAuthor = fresh(input.authorBooks, savedIds, savedTitles, [], 3);
  const byGenre = fresh(input.genreBooks, savedIds, savedTitles, byAuthor, 3);
  const books = [...byAuthor, ...byGenre];
  const savedAuthors = new Set(input.savedAuthors.map((author) => author.toLowerCase()));
  const authors: string[] = [];
  for (const book of input.genreBooks) {
    const author = book.author.trim();
    if (!author || author.toLowerCase() === "unknown" || savedAuthors.has(author.toLowerCase())) continue;
    if (authors.some((name) => name.toLowerCase() === author.toLowerCase())) continue;
    authors.push(author);
    if (authors.length >= 6) break;
  }
  return { books, authors };
}

async function interestsFor(
  books: { id: string; title: string; author: string; categories?: string | null }[],
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<ShelfInterest> {
  const interests = collectInterests(books);
  if (interests.genres.length > 0 || books.length === 0) return interests;
  const genres: string[] = [];
  for (const book of books.slice(0, 3)) {
    if (!book.id.startsWith("/works/")) continue;
    const payload = await getJson(`https://openlibrary.org${book.id}.json`, fetchImpl, signal);
    const subjects = payload && typeof payload === "object" && "subjects" in payload ? (payload as { subjects?: unknown }).subjects : null;
    const genre = chooseGenre(subjects);
    if (genre && !genres.includes(genre)) genres.push(genre);
    if (genres.length >= 2) break;
  }
  return { ...interests, genres };
}

async function getJson(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

export async function loadSuggestions(
  books: { id: string; title: string; author: string; categories?: string | null }[],
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ books: RelatedBook[]; authors: string[] }> {
  const interests = await interestsFor(books, fetchImpl, signal);
  if (interests.genres.length === 0 && interests.authors.length === 0) return { books: [], authors: [] };
  const fields = "key,title,author_name,cover_i,first_publish_year";
  const [genrePayloads, authorPayloads] = await Promise.all([
    Promise.all(interests.genres.map((genre) => getJson(`https://openlibrary.org/search.json?${new URLSearchParams({ subject: genre, limit: "8", fields })}`, fetchImpl, signal))),
    Promise.all(interests.authors.slice(0, 2).map((author) => getJson(`https://openlibrary.org/search.json?${new URLSearchParams({ author, limit: "6", fields })}`, fetchImpl, signal))),
  ]);
  return pickSuggestions({
    genreBooks: genrePayloads.flatMap((payload) => readRelated(payload)),
    authorBooks: authorPayloads.flatMap((payload) => readRelated(payload)),
    savedIds: interests.savedIds,
    savedTitles: interests.savedTitles,
    savedAuthors: interests.savedAuthors,
  });
}
