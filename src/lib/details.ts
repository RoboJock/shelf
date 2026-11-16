import { coverUrl, type LibraryHit } from "./books";
import { fillGaps, lookupFacts, type BookFacts } from "./google-books";

export interface BookLink {
  label: string;
  href: string;
}

export interface SeriesInfo {
  name: string;
  position: string | null;
  summary: string | null;
  links: BookLink[];
}

export interface BookPageInfo {
  book: LibraryHit;
  summary: string | null;
  purchase: BookLink[];
  authorLinks: BookLink[];
  series: SeriesInfo | null;
  reading: BookLink[];
}

export function bookHref(id: string, coverId?: number | null): string {
  const cover = coverId && coverId > 0 ? `&cover=${coverId}` : "";
  return `/book?id=${encodeURIComponent(id)}${cover}`;
}

export function readText(value: unknown): string | null {
  const text = typeof value === "string" ? value : value && typeof value === "object" && "value" in value && typeof value.value === "string" ? value.value : "";
  const clean = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]+)\]\(https?:[^)]+\)/g, "$1")
    .replace(/[*_]{1,3}/g, "")
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

export function purchaseLinks(title: string, author: string, offers: { buyLink?: string | null; infoLink?: string | null }): BookLink[] {
  const links: BookLink[] = [];
  const buy = offers.buyLink ? safeUrl(offers.buyLink) : null;
  if (buy) links.push({ label: "Google Play", href: buy });
  const search = `${title} ${author}`.trim();
  if (search) {
    links.push({ label: "Bookshop.org", href: `https://bookshop.org/books?keywords=${encodeURIComponent(search)}` });
    links.push({ label: "Barnes & Noble", href: `https://www.barnesandnoble.com/s/${encodeURIComponent(search)}` });
  }
  const info = offers.infoLink ? safeUrl(offers.infoLink) : null;
  if (info && info !== buy && !(buy && info.includes("play.google.com"))) links.push({ label: "Google Books", href: info });
  return links;
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

interface WorkRecord {
  title: string;
  description: string | null;
  coverId: number | null;
  year: number | null;
  subjects: string | null;
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
  const subjects = Array.isArray(work.subjects)
    ? work.subjects
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replace(/^(form|genre|place|time):/i, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ")
      .slice(0, 80)
    : "";
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
    const record = item as { volumeInfo?: { title?: string; infoLink?: string; previewLink?: string }; saleInfo?: { saleability?: string; buyLink?: string } };
    const itemTitle = record.volumeInfo?.title?.toLowerCase() ?? "";
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

export async function loadBookPage(workKey: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch, coverId?: number | null): Promise<BookPageInfo | null> {
  if (!workKey.startsWith("/works/")) return null;
  const work = readWork(await getJson(`https://openlibrary.org${workKey}.json`, fetchImpl, signal));
  if (!work) return null;
  const [authorPayload, seriesPayload] = await Promise.all([
    work.authorKey ? getJson(`https://openlibrary.org${work.authorKey}.json`, fetchImpl, signal) : Promise.resolve(null),
    work.seriesKey ? getJson(`https://openlibrary.org${work.seriesKey}.json`, fetchImpl, signal) : Promise.resolve(null),
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
  const series = seriesName ? {
    name: seriesName,
    position: work.position,
    summary: readText(seriesRecord?.description),
    links: dedupe([
      ...(work.seriesKey ? [{ label: "Open Library", href: `https://openlibrary.org${work.seriesKey}` }] : []),
      ...(seriesWiki ? [{ label: "Wikipedia", href: seriesWiki }] : []),
      ...readLinks(seriesRecord?.links, 4),
    ]),
  } : null;
  return {
    book: { ...filled, image: coverUrl(filled.coverId, filled.image) ? filled.image : null },
    summary: filled.description,
    purchase: purchaseLinks(work.title, author, readOffers(offersPayload, work.title)),
    authorLinks,
    series,
    reading: dedupe([{ label: "Open Library", href: `https://openlibrary.org${workKey}` }, ...work.links]),
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
    fields: "items(volumeInfo/title,volumeInfo/infoLink,saleInfo/saleability,saleInfo/buyLink)",
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
