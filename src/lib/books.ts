export interface BookDetails {
  description?: string | null;
  pages?: number | null;
  publisher?: string | null;
  categories?: string | null;
  image?: string | null;
}

export interface ShelfBook extends BookDetails {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverId: number | null;
  savedAt: number;
}

export interface LibraryHit extends BookDetails {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverId: number | null;
}

export type ShelfOrder = "newest" | "oldest" | "title" | "title-desc" | "author";

export const shelfOrders: { id: ShelfOrder; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "title", label: "Title A–Z" },
  { id: "title-desc", label: "Title Z–A" },
  { id: "author", label: "Author A–Z" },
];

export function sortShelf(books: ShelfBook[], order: ShelfOrder): ShelfBook[] {
  const byTitle = (a: ShelfBook, b: ShelfBook) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    || a.author.localeCompare(b.author, undefined, { sensitivity: "base" });
  return [...books].sort((a, b) => {
    if (order === "newest") return b.savedAt - a.savedAt || byTitle(a, b);
    if (order === "oldest") return a.savedAt - b.savedAt || byTitle(a, b);
    if (order === "title") return byTitle(a, b);
    if (order === "title-desc") return byTitle(b, a);
    return a.author.localeCompare(b.author, undefined, { sensitivity: "base" }) || byTitle(a, b);
  });
}

export type ResultOrder = "relevance" | "title" | "title-desc" | "author" | "author-desc" | "year" | "year-desc";

export const resultOrders: { id: ResultOrder; label: string }[] = [
  { id: "relevance", label: "Relevance" },
  { id: "title", label: "Title A–Z" },
  { id: "title-desc", label: "Title Z–A" },
  { id: "author", label: "Author A–Z" },
  { id: "author-desc", label: "Author Z–A" },
  { id: "year", label: "Year newest" },
  { id: "year-desc", label: "Year oldest" },
];

export function sortResults(hits: LibraryHit[], order: ResultOrder): LibraryHit[] {
  if (order === "relevance") return hits;
  const byTitle = (a: LibraryHit, b: LibraryHit) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    || a.author.localeCompare(b.author, undefined, { sensitivity: "base" });
  const byAuthor = (a: LibraryHit, b: LibraryHit) =>
    a.author.localeCompare(b.author, undefined, { sensitivity: "base" }) || byTitle(a, b);
  const byYear = (a: LibraryHit, b: LibraryHit, newest: boolean) => {
    if (a.year == null && b.year == null) return byTitle(a, b);
    if (a.year == null) return 1;
    if (b.year == null) return -1;
    return newest ? b.year - a.year || byTitle(a, b) : a.year - b.year || byTitle(a, b);
  };
  return [...hits].sort((a, b) => {
    if (order === "title") return byTitle(a, b);
    if (order === "title-desc") return byTitle(b, a);
    if (order === "author") return byAuthor(a, b);
    if (order === "author-desc") return byAuthor(b, a);
    return byYear(a, b, order === "year");
  });
}

export function coverUrl(coverId: number | null, image?: string | null): string | null {
  if (coverId !== null && Number.isInteger(coverId) && coverId > 0) {
    return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`;
  }
  if (image && /^https:\/\/books\.google(?:usercontent)?\.com\//.test(image)) return image;
  return null;
}

export function bookDocId(workKey: string): string {
  const segment = workKey.split("/").filter(Boolean).pop() ?? workKey;
  return segment.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function yearOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2100) return null;
  return value;
}

function coverOf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export function readSearch(payload: unknown, limit = 12): LibraryHit[] {
  if (!payload || typeof payload !== "object" || !("docs" in payload) || !Array.isArray(payload.docs)) return [];
  const hits: LibraryHit[] = [];
  const seen = new Set<string>();
  for (const doc of payload.docs) {
    if (!doc || typeof doc !== "object") continue;
    const record = doc as Record<string, unknown>;
    const id = text(record.key, 80);
    const title = text(record.title, 300);
    if (!id.startsWith("/works/") || !title || seen.has(id)) continue;
    const authors = Array.isArray(record.author_name) ? record.author_name : [];
    const author = text(authors[0], 200) || "Unknown";
    seen.add(id);
    hits.push({
      id,
      title,
      author,
      year: yearOf(record.first_publish_year),
      coverId: coverOf(record.cover_i),
    });
    if (hits.length === limit) break;
  }
  return hits;
}

export function readBook(id: string, data: Record<string, unknown>): ShelfBook | null {
  const title = text(data.title, 300);
  const workKey = text(data.workKey, 80);
  if (!title || !workKey.startsWith("/works/")) return null;
  return {
    id: workKey || id,
    title,
    author: text(data.author, 200) || "Unknown",
    year: yearOf(data.year),
    coverId: coverOf(data.coverId),
    savedAt: typeof data.savedAt === "number" && data.savedAt > 0 ? data.savedAt : Date.now(),
    description: text(data.description, 480) || null,
    pages: typeof data.pages === "number" && Number.isInteger(data.pages) && data.pages > 0 && data.pages <= 20000 ? data.pages : null,
    publisher: text(data.publisher, 120) || null,
    categories: text(data.categories, 80) || null,
    image: typeof data.image === "string" && /^https:\/\/books\.google(?:usercontent)?\.com\//.test(data.image) ? data.image.slice(0, 300) : null,
  };
}
