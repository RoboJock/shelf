export interface BookFacts {
  description: string | null;
  pages: number | null;
  publisher: string | null;
  categories: string | null;
  year: number | null;
  image: string | null;
}

interface VolumeMatch extends BookFacts {
  title: string;
  authors: string[];
}

const EMPTY: BookFacts = { description: null, pages: null, publisher: null, categories: null, year: null, image: null };

function plain(value: string, max: number): string {
  const text = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

function words(value: string): string[] {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? [];
}

function titleScore(wanted: string, found: string): number {
  if (!wanted || !found) return 0;
  if (wanted === found) return 1;
  if (found.startsWith(wanted) || wanted.startsWith(found)) return 0.9;
  const left = new Set(words(wanted));
  const right = words(found);
  if (left.size === 0 || right.length === 0) return 0;
  const shared = right.filter((word) => left.has(word)).length;
  return shared / Math.max(left.size, new Set(right).size);
}

function googleImage(links: unknown): string | null {
  if (!links || typeof links !== "object") return null;
  const record = links as Record<string, unknown>;
  const raw = [record.thumbnail, record.smallThumbnail].find((value) => typeof value === "string") as string | undefined;
  if (!raw) return null;
  const secure = raw.replace(/^http:\/\//, "https://");
  if (!/^https:\/\/books\.google(?:usercontent)?\.com\//.test(secure) || secure.length > 300) return null;
  return secure;
}

export function readVolumes(payload: unknown): VolumeMatch[] {
  if (!payload || typeof payload !== "object" || !("items" in payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap((item) => {
    if (!item || typeof item !== "object" || !("volumeInfo" in item)) return [];
    const info = (item as { volumeInfo?: unknown }).volumeInfo;
    if (!info || typeof info !== "object") return [];
    const record = info as Record<string, unknown>;
    const title = typeof record.title === "string" ? plain(record.title, 300) : "";
    if (!title) return [];
    const authors = Array.isArray(record.authors) ? record.authors.flatMap((name) => typeof name === "string" ? [plain(name, 200)] : []) : [];
    const published = typeof record.publishedDate === "string" ? record.publishedDate.match(/\d{4}/)?.[0] : "";
    const year = published ? Number(published) : null;
    const pages = typeof record.pageCount === "number" && Number.isInteger(record.pageCount) && record.pageCount > 0 && record.pageCount <= 20000
      ? record.pageCount
      : null;
    const categories = Array.isArray(record.categories)
      ? record.categories.flatMap((name) => typeof name === "string" ? [plain(name, 40)] : []).filter(Boolean).slice(0, 2).join(", ")
      : "";
    return [{
      title,
      authors,
      description: typeof record.description === "string" ? plain(record.description, 480) || null : null,
      pages,
      publisher: typeof record.publisher === "string" ? plain(record.publisher, 120) || null : null,
      categories: categories.slice(0, 80) || null,
      year: year && year > 0 && year <= 2100 ? year : null,
      image: googleImage(record.imageLinks),
    }];
  });
}

export function chooseVolume(title: string, author: string, volumes: VolumeMatch[]): BookFacts | null {
  const wantedTitle = words(title).join(" ");
  const wantedAuthor = new Set(words(author).filter((word) => word.length > 2 && word !== "unknown"));
  let best: { score: number; facts: BookFacts } | null = null;
  for (const volume of volumes) {
    let score = titleScore(wantedTitle, words(volume.title).join(" "));
    const authorText = words(volume.authors.join(" "));
    if (wantedAuthor.size > 0 && [...wantedAuthor].some((word) => authorText.includes(word))) score += 0.15;
    if (!best || score > best.score) best = { score, facts: volume };
    if (score >= 1.1) break;
  }
  if (!best || best.score < 0.75) return null;
  return best.facts;
}

export function fillGaps<T extends { title: string; author: string; year: number | null; coverId: number | null; description?: string | null; pages?: number | null; publisher?: string | null; categories?: string | null; image?: string | null }>(book: T, facts: BookFacts | null): T {
  if (!facts) return book;
  return {
    ...book,
    description: book.description || facts.description,
    pages: book.pages ?? facts.pages,
    publisher: book.publisher || facts.publisher,
    categories: book.categories || facts.categories,
    year: book.year ?? facts.year,
    image: book.coverId ? book.image ?? null : book.image || facts.image,
  };
}

function booksKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim() ?? "";
}

export async function lookupFacts(title: string, author: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<BookFacts | null> {
  const key = booksKey();
  if (!key || !title.trim()) return null;
  const query = [`intitle:"${title.replace(/"/g, "")}"`];
  if (author.trim() && author.trim().toLowerCase() !== "unknown") query.push(`inauthor:"${author.replace(/"/g, "")}"`);
  const url = `https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({
    q: query.join(" "),
    maxResults: "5",
    printType: "books",
    fields: "items(volumeInfo/title,volumeInfo/authors,volumeInfo/description,volumeInfo/pageCount,volumeInfo/publisher,volumeInfo/publishedDate,volumeInfo/categories,volumeInfo/imageLinks)",
    key,
  })}`;
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    return chooseVolume(title, author, readVolumes(await response.json()));
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

const memory = new Map<string, BookFacts | null>();

export async function enrichBooks<T extends { title: string; author: string; year: number | null; coverId: number | null; description?: string | null; pages?: number | null; publisher?: string | null; categories?: string | null; image?: string | null }>(books: T[], signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<T[]> {
  return Promise.all(books.map(async (book) => {
    if (book.description && book.pages && book.publisher) return book;
    const cacheKey = `${book.title}\n${book.author}`;
    if (!memory.has(cacheKey)) memory.set(cacheKey, await lookupFacts(book.title, book.author, signal, fetchImpl));
    return fillGaps(book, memory.get(cacheKey) ?? null);
  }));
}

export function emptyFacts(): BookFacts {
  return { ...EMPTY };
}
