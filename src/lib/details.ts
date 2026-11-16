import { coverUrl, type LibraryHit } from "./books";
import { fillGaps, lookupFacts, type BookFacts } from "./google-books";

export interface BookLink {
  label: string;
  href: string;
}

export interface RelatedBook {
  id: string;
  title: string;
  author: string;
  year: number | null;
  coverId: number | null;
  position: string | null;
}

export interface SeriesInfo {
  name: string;
  position: string | null;
  summary: string | null;
  links: BookLink[];
  books: RelatedBook[];
}

export interface BookPageInfo {
  book: LibraryHit;
  summary: string | null;
  purchase: BookLink[];
  authorLinks: BookLink[];
  series: SeriesInfo | null;
  reading: BookLink[];
  genre: string | null;
  suggestions: RelatedBook[];
}

export function bookHref(id: string, coverId?: number | null): string {
  const cover = coverId && coverId > 0 ? `&cover=${coverId}` : "";
  return `/book?id=${encodeURIComponent(id)}${cover}`;
}

export function readText(value: unknown): string | null {
  const text = typeof value === "string" ? value : value && typeof value === "object" && "value" in value && typeof value.value === "string" ? value.value : "";
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\(https?:[^)]+\)/g, "$1")
    .replace(/[*_]{1,3}/g, "")
    .replace(/#+\s*/g, "")
    .replace(/[▶►]\s*/g, "")
    .replace(/Read this book online\.?\s*/gi, "")
    .replace(/This description comes from the publisher\.?/gi, "")
    .split(/\s---\s/)[0]
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, 4000) : null;
}

export function readLinks(value: unknown, limit = 6): BookLink[] {
  if (!Array.isArray(value)) return [];
  const links: BookLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const href = "url" in item && typeof item.url === "string" ? safeUrl(item.url) : null;
    const label = "title" in item && typeof item.title === "string" ? item.title.trim() : "";
    if (!href || !label) continue;
    links.push({ label: label.slice(0, 80), href });
    if (links.length >= limit) break;
  }
  return links;
}

export function amazonAsin(sourceRecords: unknown): string | null {
  if (!Array.isArray(sourceRecords)) return null;
  for (const record of sourceRecords) {
    if (typeof record !== "string") continue;
    const match = record.match(/^amazon:([A-Za-z0-9]{10})$/);
    if (match && !match[1].toUpperCase().startsWith("B")) return match[1].toUpperCase();
  }
  return null;
}

export function readEditionIsbns(payload: unknown, title: string): string[] {
  const entries = payload && typeof payload === "object" && Array.isArray((payload as { entries?: unknown[] }).entries)
    ? (payload as { entries: unknown[] }).entries
    : [];
  const wanted = plainTitle(title);
  const ranked: { isbn: string; rank: number }[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const editionTitle = typeof record.title === "string" ? record.title : "";
    const publishers = Array.isArray(record.publishers) ? record.publishers.join(" ") : "";
    const format = typeof record.physical_format === "string" ? record.physical_format : "";
    const blob = `${editionTitle} ${publishers} ${format}`;
    if (/large print|thorndike|audio|mp3|compact disc|\bcd\b|library binding|board book|box set|kindle|ebook|epub|sound recording/i.test(blob)) continue;
    if (wanted && plainTitle(editionTitle) && !plainTitle(editionTitle).startsWith(wanted)) continue;
    const isbn13 = [record.isbn_13, record.isbn].flat().find((item) => typeof item === "string" && /^\d{13}$/.test(item));
    if (typeof isbn13 !== "string" || ranked.some((item) => item.isbn === isbn13)) continue;
    ranked.push({ isbn: isbn13, rank: editionScore(record, isbn13) });
  }
  return ranked.sort((a, b) => b.rank - a.rank).map((item) => item.isbn);
}

export function retailCandidates(records: unknown[], title: string): { isbn13: string | null; asin: string | null }[] {
  const wanted = plainTitle(title);
  const parsed = records.flatMap((record) => {
    if (!record || typeof record !== "object") return [];
    const item = record as Record<string, unknown>;
    const editionTitle = typeof item.title === "string" ? item.title : "";
    if (wanted && plainTitle(editionTitle) && !plainTitle(editionTitle).startsWith(wanted)) return [];
    const format = typeof item.physical_format === "string" ? item.physical_format : "";
    const publishers = Array.isArray(item.publishers) ? item.publishers.join(" ") : "";
    if (/audio|mp3|\bcd\b|kindle|ebook|epub|sound recording|large print|thorndike|library binding/i.test(`${format} ${publishers}`)) return [];
    const isbn13 = Array.isArray(item.isbn_13) ? item.isbn_13.find((value) => typeof value === "string" && /^\d{13}$/.test(value)) : null;
    const asin = amazonAsin(item.source_records);
    if (typeof isbn13 !== "string" && !asin) return [];
    const pages = typeof item.number_of_pages === "number" ? item.number_of_pages : null;
    const print = /paperback|hardcover|hardback/.test(format.toLowerCase()) ? 0 : 1;
    return [{ isbn13: typeof isbn13 === "string" ? isbn13 : null, asin, pages, print, tier: publisherTier(publishers) }];
  });
  const readable = parsed.filter((item) => item.pages === null || (item.pages >= 120 && item.pages <= 900));
  const pool = [...(readable.length > 0 ? readable : parsed)].sort((a, b) => a.tier - b.tier || editionRank(a) - editionRank(b));
  return pool;
}

export function chooseRetail(records: unknown[], title: string): { isbn13: string | null; asin: string | null } {
  const pool = retailCandidates(records, title);
  const pick = pool[0];
  const asin = pick?.asin || pool.find((item) => item.asin)?.asin || null;
  return pick ? { isbn13: pick.isbn13, asin } : { isbn13: null, asin: null };
}

const STORE_PRODUCT = "https://e9c22f-3.myshopify.com/products";

export function isbn10(isbn13: string): string | null {
  if (!/^978\d{10}$/.test(isbn13)) return null;
  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < body.length; index += 1) sum += Number(body[index]) * (10 - index);
  const check = (11 - (sum % 11)) % 11;
  return body + (check === 10 ? "X" : String(check));
}

export function readStoreTitle(payload: unknown): string | null {
  const product = payload && typeof payload === "object" ? (payload as { product?: { title?: unknown } }).product : null;
  const title = product && typeof product.title === "string" ? product.title.trim() : "";
  return title || null;
}

export function sameBookTitle(workTitle: string, storeTitle: string): boolean {
  const wanted = plainTitle(workTitle);
  const listed = plainTitle(storeTitle);
  return Boolean(wanted && listed && (listed.startsWith(wanted) || wanted.startsWith(listed)));
}

export function purchaseLinks(_title: string, _author: string, offers: { buyLink?: string | null; infoLink?: string | null; isbn13?: string | null; asin?: string | null }): BookLink[] {
  const links: BookLink[] = [];
  const buy = offers.buyLink ? safeUrl(offers.buyLink) : null;
  if (buy && buy.includes("play.google.com") && buy.includes("id=")) links.push({ label: "Google Play", href: buy });
  const asin = offers.asin && /^[A-Z0-9]{10}$/.test(offers.asin) ? offers.asin : null;
  if (asin) links.push({ label: "Amazon", href: `https://www.amazon.com/dp/${asin}` });
  const isbn13 = offers.isbn13 && /^\d{13}$/.test(offers.isbn13) ? offers.isbn13 : null;
  if (isbn13) {
    links.push({ label: "Bookshop.org", href: `https://bookshop.org/book/${isbn13}` });
    links.push({ label: "Barnes & Noble", href: `https://www.barnesandnoble.com/w/?ean=${isbn13}` });
  }
  const info = offers.infoLink ? safeUrl(offers.infoLink) : null;
  if (info && /[?&]id=/.test(info) && !(buy && info.includes("play.google.com"))) links.push({ label: "Google Books", href: info });
  return links;
}

function editionScore(record: Record<string, unknown>, isbn13: string): number {
  const publishers = Array.isArray(record.publishers) ? record.publishers.join(" ") : "";
  const format = typeof record.physical_format === "string" ? record.physical_format.toLowerCase() : "";
  const languages = Array.isArray(record.languages) ? record.languages : [];
  const english = languages.some((item) => item && typeof item === "object" && "key" in item && item.key === "/languages/eng");
  const trade = /little,\s*brown|houghton|mariner|william morrow|simon & schuster|simon and schuster|knopf|random house|scribner|farrar|norton/i.test(publishers);
  let score = 0;
  if (english) score += 50;
  else if (languages.length === 0) score += 20;
  if (isbn13.startsWith("9780") || isbn13.startsWith("9781")) score += 40;
  if (/hardcover|hardback|paperback/.test(format)) score += 25;
  if (trade && !/\b(plc|ltd)\b/i.test(publishers)) score += 20;
  if (/\b(plc|ltd)\b|large print/i.test(publishers)) score -= 25;
  const pages = record.number_of_pages;
  if (typeof pages === "number" && pages >= 120 && pages <= 900) score += 8;
  return score;
}

function publisherTier(publishers: string): number {
  const text = publishers.toLowerCase();
  if (/thorndike|large print|library binding/.test(text)) return 3;
  if (/\bplc\b|\bltd\b/.test(text)) return 2;
  if (/little,\s*brown|houghton|mariner|william morrow|simon & schuster|simon and schuster|knopf|scribner|farrar|norton|bloomsbury publishing/.test(text)) return 0;
  return 1;
}

function editionRank(item: { isbn13: string | null; asin: string | null; print: number }): number {
  const english = item.isbn13?.startsWith("9780") || item.isbn13?.startsWith("9781") ? 0 : 10;
  return english + (item.asin ? 0 : 2) + item.print;
}

function plainTitle(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
}

export function wikipediaUrl(payload: unknown): string | null {
  if (!Array.isArray(payload) || !Array.isArray(payload[3])) return null;
  const href = payload[3].find((item) => typeof item === "string" && item.startsWith("https://"));
  return typeof href === "string" ? href : null;
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("http://books.google.com")) return `https://${trimmed.slice(7)}`;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return trimmed;
  return null;
}

function yearOf(value: unknown): number | null {
  const match = String(value ?? "").match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return year >= 1000 && year <= 2100 ? year : null;
}

function subjectNames(subjects: unknown): string[] {
  if (!Array.isArray(subjects)) return [];
  const names = subjects.flatMap((item) => {
    if (typeof item !== "string") return [];
    if (/^(form|place|time|series|nyt):/i.test(item) || /=/.test(item)) return [];
    const name = item.replace(/^genre:/i, "").replace(/_/g, " ").trim();
    if (!name || SKIPPED_SUBJECTS.has(name.toLowerCase()) || name.length > 40) return [];
    return [name];
  });
  return [...new Set(names)];
}

const PREFERRED_GENRES = ["fantasy", "science fiction", "mystery", "romance", "horror", "historical fiction", "thriller", "adventure", "young adult", "magic", "wizards", "dystopia", "classics", "biography", "poetry", "drama", "crime"];
const SKIPPED_SUBJECTS = new Set(["fiction", "novel", "novels", "short stories", "english literature", "american literature", "literature", "juvenile fiction", "juvenile literature", "accessible book", "protected daisy", "in library", "large type books"]);

export function chooseGenre(subjects: unknown): string | null {
  if (!Array.isArray(subjects)) return null;
  const names = subjects.flatMap((item) => {
    if (typeof item !== "string") return [];
    const tagged = /^(form|place|time|series):/i.test(item);
    const name = item.replace(/^(form|genre|place|time|series):/i, "").replace(/_/g, " ").trim();
    if (!name || tagged) return [];
    return [{ genre: /^genre:/i.test(item), name }];
  });
  const tagged = names.find((item) => item.genre && !SKIPPED_SUBJECTS.has(item.name.toLowerCase()));
  if (tagged) return tagged.name.toLowerCase();
  for (const genre of PREFERRED_GENRES) {
    if (names.some((item) => item.name.toLowerCase() === genre || item.name.toLowerCase().includes(genre))) return genre;
  }
  const first = names.find((item) => !SKIPPED_SUBJECTS.has(item.name.toLowerCase()) && item.name.length <= 32);
  return first ? first.name.toLowerCase() : null;
}

export function seriesPlace(name: string, position: string | null): string {
  const range = position?.trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return `Books ${range[1]}–${range[2]} of ${name}`;
  if (position && /^\d+$/.test(position.trim())) return `Book ${position.trim()} of ${name}`;
  if (position?.trim()) return `Part ${position.trim()} of ${name}`;
  return `Part of ${name}`;
}

export function isCollection(title: string): boolean {
  return /\b(box set|collection|omnibus|pack)\b/i.test(title)
    || /\(\s*series\s*\)/i.test(title)
    || (/\bseries\b/i.test(title) && /\d+\s*[-–]\s*\d+/.test(title));
}

export function readRelated(payload: unknown): RelatedBook[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { docs?: unknown[] }).docs)) return [];
  const books: RelatedBook[] = [];
  for (const doc of (payload as { docs: unknown[] }).docs) {
    if (!doc || typeof doc !== "object") continue;
    const record = doc as Record<string, unknown>;
    const id = typeof record.key === "string" ? record.key : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!id.startsWith("/works/") || !title || isCollection(title)) continue;
    const authors = Array.isArray(record.author_name) ? record.author_name : [];
    books.push({
      id,
      title,
      author: typeof authors[0] === "string" ? authors[0] : "Unknown",
      year: typeof record.first_publish_year === "number" ? record.first_publish_year : null,
      coverId: typeof record.cover_i === "number" && record.cover_i > 0 ? record.cover_i : null,
      position: null,
    });
    if (books.length >= 10) break;
  }
  return books;
}

export function orderSeries(books: RelatedBook[]): RelatedBook[] {
  return [...books].sort((a, b) => {
    const rank = positionRank(a.position) - positionRank(b.position);
    if (rank !== 0) return rank;
    if (a.year !== b.year) {
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    }
    return a.title.localeCompare(b.title);
  });
}

function positionRank(value: string | null): number {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : 10000;
}

interface WorkRecord {
  title: string;
  description: string | null;
  coverId: number | null;
  year: number | null;
  subjects: string | null;
  subjectNames: unknown;
  links: BookLink[];
  authorKey: string | null;
  seriesKey: string | null;
  position: string | null;
}

function readWork(payload: unknown): WorkRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const work = payload as Record<string, unknown>;
  const title = typeof work.title === "string" ? work.title.trim() : "";
  if (!title) return null;
  const covers = Array.isArray(work.covers) ? work.covers : [];
  const coverId = typeof covers[0] === "number" && covers[0] > 0 ? covers[0] : null;
  const names = subjectNames(work.subjects);
  const subjects = names.slice(0, 3).join(" · ").slice(0, 80);
  const authors = Array.isArray(work.authors) ? work.authors : [];
  const firstAuthor = authors[0] && typeof authors[0] === "object" ? authors[0] as Record<string, unknown> : null;
  const author = firstAuthor?.author && typeof firstAuthor.author === "object" ? firstAuthor.author as Record<string, unknown> : null;
  const series = Array.isArray(work.series) && work.series[0] && typeof work.series[0] === "object" ? work.series[0] as Record<string, unknown> : null;
  const seriesRef = series?.series && typeof series.series === "object" ? series.series as Record<string, unknown> : null;
  return {
    title,
    description: readText(work.description),
    coverId,
    year: yearOf(work.first_publish_date),
    subjects: subjects || null,
    subjectNames: work.subjects,
    links: readLinks(work.links),
    authorKey: typeof author?.key === "string" ? author.key : null,
    seriesKey: typeof seriesRef?.key === "string" ? seriesRef.key : null,
    position: typeof series?.position === "string" ? series.position : null,
  };
}

function readOffers(payload: unknown, title: string): { buyLink: string | null; infoLink: string | null } {
  const items = payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items) ? (payload as { items: unknown[] }).items : [];
  let buyLink: string | null = null;
  let infoLink: string | null = null;
  const wanted = title.toLowerCase();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as { volumeInfo?: { title?: string; language?: string; infoLink?: string; previewLink?: string }; saleInfo?: { saleability?: string; buyLink?: string } };
    const itemTitle = record.volumeInfo?.title?.toLowerCase() ?? "";
    if (record.volumeInfo?.language && record.volumeInfo.language !== "en") continue;
    if (!itemTitle.includes(wanted) && !wanted.includes(itemTitle)) continue;
    if (!infoLink && record.volumeInfo?.infoLink) infoLink = record.volumeInfo.infoLink;
    if (!buyLink && record.saleInfo?.saleability === "FOR_SALE" && record.saleInfo.buyLink) buyLink = record.saleInfo.buyLink;
    if (buyLink && infoLink) break;
  }
  return { buyLink, infoLink };
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

async function wiki(name: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<string | null> {
  if (!name.trim()) return null;
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: "opensearch",
    search: name,
    limit: "1",
    namespace: "0",
    format: "json",
    origin: "*",
  })}`;
  return wikipediaUrl(await getJson(url, fetchImpl, signal));
}

export function popularIsbns(payload: unknown): string[] {
  const docs = payload && typeof payload === "object" && Array.isArray((payload as { docs?: unknown[] }).docs) ? (payload as { docs: unknown[] }).docs : [];
  const doc = docs[0] && typeof docs[0] === "object" ? docs[0] as { isbn?: unknown[] } : null;
  const values = Array.isArray(doc?.isbn) ? doc.isbn : [];
  return values.filter((item): item is string => typeof item === "string" && /^97[89]\d{10}$/.test(item) && (item.startsWith("9780") || item.startsWith("9781")));
}

async function retailEdition(title: string, editionsPayload: unknown, popularPayload: unknown, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<{ isbn13: string | null; asin: string | null }> {
  const isbns = [...new Set([...popularIsbns(popularPayload).slice(0, 8), ...readEditionIsbns(editionsPayload, title)])].slice(0, 8);
  const records = await Promise.all(isbns.map(async (isbn) => {
    const record = await getJson(`https://openlibrary.org/isbn/${isbn}.json`, fetchImpl, signal);
    return record && typeof record === "object" ? { ...record, isbn_13: [isbn] } : null;
  }));
  const ranked = retailCandidates(records, title).filter((item) => item.isbn13).slice(0, 6);
  const listed = (await Promise.all(ranked.map(async (item) => {
    const storeTitle = readStoreTitle(await getJson(`${STORE_PRODUCT}/${item.isbn13}.json`, fetchImpl, signal));
    return storeTitle && sameBookTitle(title, storeTitle) ? item : null;
  }))).filter((item) => item !== null);
  const pick = listed[0];
  return { isbn13: pick?.isbn13 ?? null, asin: pick?.asin || (pick?.isbn13 ? isbn10(pick.isbn13) : null) };
}

export async function loadBookPage(workKey: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch, coverId?: number | null): Promise<BookPageInfo | null> {
  if (!workKey.startsWith("/works/")) return null;
  const work = readWork(await getJson(`https://openlibrary.org${workKey}.json`, fetchImpl, signal));
  if (!work) return null;
  const genre = chooseGenre(work.subjectNames);
  const seriesId = work.seriesKey?.split("/").pop() ?? "";
  const [authorPayload, seriesPayload, seriesSearch, suggestionSearch, editionsPayload, popularPayload] = await Promise.all([
    work.authorKey ? getJson(`https://openlibrary.org${work.authorKey}.json`, fetchImpl, signal) : Promise.resolve(null),
    work.seriesKey ? getJson(`https://openlibrary.org${work.seriesKey}.json`, fetchImpl, signal) : Promise.resolve(null),
    seriesId ? getJson(`https://openlibrary.org/search.json?${new URLSearchParams({ q: `series_key:${seriesId}`, limit: "12", fields: "key,title,author_name,cover_i,first_publish_year" })}`, fetchImpl, signal) : Promise.resolve(null),
    genre ? getJson(`https://openlibrary.org/search.json?${new URLSearchParams({ subject: genre, limit: "12", fields: "key,title,author_name,cover_i,first_publish_year" })}`, fetchImpl, signal) : Promise.resolve(null),
    getJson(`https://openlibrary.org${workKey}/editions.json?${new URLSearchParams({ limit: "50" })}`, fetchImpl, signal),
    getJson(`https://openlibrary.org/search.json?${new URLSearchParams({ q: `key:${workKey}`, fields: "key,isbn", limit: "1" })}`, fetchImpl, signal),
  ]);
  const authorRecord = authorPayload && typeof authorPayload === "object" ? authorPayload as Record<string, unknown> : null;
  const author = typeof authorRecord?.name === "string" ? authorRecord.name : "Unknown";
  const seriesRecord = seriesPayload && typeof seriesPayload === "object" ? seriesPayload as Record<string, unknown> : null;
  const seriesName = typeof seriesRecord?.name === "string" ? seriesRecord.name : typeof seriesRecord?.title === "string" ? seriesRecord.title : "";
  const [facts, offersPayload, authorWiki, seriesWiki] = await Promise.all([
    lookupFacts(work.title, author, signal, fetchImpl).catch(() => null as BookFacts | null),
    offers(work.title, author, signal, fetchImpl),
    wiki(author === "Unknown" ? "" : author, fetchImpl, signal),
    wiki(seriesName, fetchImpl, signal),
  ]);
  const filled = fillGaps({
    id: workKey,
    title: work.title,
    author,
    year: work.year,
    coverId: coverId && coverId > 0 ? coverId : work.coverId,
    description: work.description,
    pages: null,
    publisher: null,
    categories: work.subjects,
    image: null,
  }, facts);
  const authorLinks = dedupe([
    ...(authorWiki ? [{ label: "Wikipedia", href: authorWiki }] : []),
    ...readLinks(authorRecord?.links, 4),
    ...(work.authorKey ? [{ label: "Open Library", href: `https://openlibrary.org${work.authorKey}` }] : []),
  ]);
  const seriesBooks = await Promise.all(readRelated(seriesSearch).map(async (item) => {
    if (item.id === workKey) return { ...item, position: work.position };
    const other = readWork(await getJson(`https://openlibrary.org${item.id}.json`, fetchImpl, signal));
    if (other?.seriesKey && work.seriesKey && other.seriesKey !== work.seriesKey) return null;
    return { ...item, position: other?.position ?? null, coverId: item.coverId ?? other?.coverId ?? null };
  }));
  const ordered = orderSeries(seriesBooks.filter((item): item is RelatedBook => Boolean(item)));
  const seriesIds = new Set(ordered.map((item) => item.id));
  const series = seriesName ? {
    name: seriesName,
    position: work.position,
    summary: readText(seriesRecord?.description),
    links: dedupe([
      ...(work.seriesKey ? [{ label: "Open Library", href: `https://openlibrary.org${work.seriesKey}` }] : []),
      ...(seriesWiki ? [{ label: "Wikipedia", href: seriesWiki }] : []),
      ...readLinks(seriesRecord?.links, 4),
    ]),
    books: ordered.filter((item) => item.id !== workKey),
  } : null;
  return {
    book: { ...filled, image: coverUrl(filled.coverId, filled.image) ? filled.image : null },
    summary: filled.description,
    purchase: purchaseLinks(work.title, author, { ...readOffers(offersPayload, work.title), ...(await retailEdition(work.title, editionsPayload, popularPayload, fetchImpl, signal)) }),
    authorLinks,
    series,
    reading: dedupe([{ label: "Open Library", href: `https://openlibrary.org${workKey}` }, ...work.links]),
    genre,
    suggestions: readRelated(suggestionSearch).filter((item) => item.id !== workKey && !seriesIds.has(item.id)).slice(0, 6),
  };
}

async function offers(title: string, author: string, signal: AbortSignal | undefined, fetchImpl: typeof fetch): Promise<unknown | null> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY?.trim() ?? "";
  if (!key) return null;
  const query = [`intitle:"${title.replace(/"/g, "")}"`];
  if (author.trim() && author.toLowerCase() !== "unknown") query.push(`inauthor:"${author.replace(/"/g, "")}"`);
  const url = `https://www.googleapis.com/books/v1/volumes?${new URLSearchParams({
    q: query.join(" "),
    maxResults: "5",
    printType: "books",
    country: "US",
    langRestrict: "en",
    fields: "items(volumeInfo/title,volumeInfo/language,volumeInfo/infoLink,saleInfo/saleability,saleInfo/buyLink)",
    key,
  })}`;
  return getJson(url, fetchImpl, signal);
}

function dedupe(links: BookLink[]): BookLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}
