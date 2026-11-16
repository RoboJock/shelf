import assert from "node:assert/strict";
import test from "node:test";
import { chooseGenre, chooseRetail, isbn10, isCollection, loadBookPage, purchaseLinks, readLinks, readRelated, readStoreTitle, readText, sameBookTitle, seriesPlace, wikipediaUrl } from "./details";

test("a work description can be a string or an object", () => {
  assert.equal(readText("A full summary of the book."), "A full summary of the book.");
  assert.equal(readText({ type: "/type/text", value: "The longer text." }), "The longer text.");
  assert.equal(
    readText("**From the *Times*.** See [Piranesi](https://example.com/p). This description comes from the publisher."),
    "From the Times. See Piranesi.",
  );
  assert.equal(
    readText("### [▶ Read this book online](https://example.com/read)\n\nA full summary."),
    "A full summary.",
  );
  assert.equal(readText({ value: 4 }), null);
});

test("only web links from the catalog are kept", () => {
  const links = readLinks([
    { title: "The Lord of the Rings - Wikipedia", url: "https://en.wikipedia.org/wiki/The_Lord_of_the_Rings" },
    { title: "Skip", url: "javascript:alert(1)" },
  ]);
  assert.deepEqual(links, [{ label: "The Lord of the Rings - Wikipedia", href: "https://en.wikipedia.org/wiki/The_Lord_of_the_Rings" }]);
});

test("purchase links open the listing for that edition", () => {
  const links = purchaseLinks("Piranesi", "Susanna Clarke", {
    buyLink: "https://play.google.com/store/books/details?id=abc",
    infoLink: "http://books.google.com/books?id=abc",
    isbn13: "9781635575637",
    asin: "163557563X",
  });
  assert.equal(links.find((link) => link.label === "Google Play")?.href, "https://play.google.com/store/books/details?id=abc");
  assert.equal(links.find((link) => link.label === "Amazon")?.href, "https://www.amazon.com/dp/163557563X");
  assert.equal(links.find((link) => link.label === "Bookshop.org")?.href, "https://bookshop.org/book/9781635575637");
  assert.equal(links.find((link) => link.label === "Barnes & Noble")?.href, "https://www.barnesandnoble.com/w/?ean=9781635575637");
  assert.equal(links.find((link) => link.label === "Google Books")?.href.startsWith("https://books.google.com/books?id=abc"), true);
  const bare = purchaseLinks("Piranesi", "Susanna Clarke", {});
  assert.equal(bare.length, 0);
});

test("an ISBN-13 becomes the ISBN-10 Amazon uses for that printing", () => {
  assert.equal(isbn10("9781635575637"), "163557563X");
  assert.equal(isbn10("9780316556347"), "0316556343");
  assert.equal(isbn10("9780618574940"), "0618574948");
  assert.equal(isbn10("9791234567896"), null);
});

test("a store listing has to be the same book", () => {
  assert.equal(readStoreTitle({ product: { title: "Piranesi (Women's Prize for Fiction Winner)" } }), "Piranesi (Women's Prize for Fiction Winner)");
  assert.equal(readStoreTitle({}), null);
  assert.equal(sameBookTitle("Piranesi", "Piranesi (Women's Prize for Fiction Winner)"), true);
  assert.equal(sameBookTitle("The Fellowship of the Ring", "The Fellowship of the Ring (The Lord of the Rings, Part 1)"), true);
  assert.equal(sameBookTitle("Circe", "The Song of Achilles"), false);
});

test("a retail edition prefers the Amazon listing for that title", () => {
  const chosen = chooseRetail([
    { title: "Piranesi", isbn_13: ["9781526622433"], physical_format: "paperback", number_of_pages: 245, source_records: ["bwb:9781526622433"] },
    { title: "Piranesi", isbn_13: ["9781635575637"], physical_format: "hardcover", number_of_pages: 272, source_records: ["amazon:163557563X"] },
  ], "Piranesi");
  assert.deepEqual(chosen, { isbn13: "9781635575637", asin: "163557563X" });
  const english = chooseRetail([
    { title: "Piranesi", isbn_13: ["9788417918484"], number_of_pages: 272, source_records: ["amazon:8417918485"] },
    { title: "Piranesi", isbn_13: ["9781635577808"], physical_format: "paperback", number_of_pages: 272, source_records: ["amazon:1635577802"] },
  ], "Piranesi");
  assert.equal(english.asin, "1635577802");
  const fellowship = chooseRetail([
    { title: "The Fellowship of the Ring", isbn_13: ["9780008108298"], physical_format: "paperback", publishers: ["HarperCollins"], number_of_pages: 500, source_records: ["amazon:0008108293"] },
    { title: "The Fellowship of the Ring", isbn_13: ["9780618574940"], physical_format: "Paperback", publishers: ["Houghton Mifflin Company"], number_of_pages: 400 },
  ], "The Fellowship of the Ring");
  assert.equal(fellowship.isbn13, "9780618574940");
  assert.equal(fellowship.asin, "0008108293");
});

test("a book page keeps the catalog summary and adds purchase and series links", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const json = (body: unknown) => ({ ok: true, json: async () => body });
    if (url.includes("/works/OL1W")) return json({
      title: "The Lord of the Rings",
      description: { value: "A full summary of the war of the ring." },
      first_publish_date: "1954",
      covers: [99],
      subjects: ["Fantasy"],
      authors: [{ author: { key: "/authors/OL1A" } }],
      series: [{ series: { key: "/series/OL1L" }, position: "1-3" }],
      links: [{ title: "The Lord of the Rings - Wikipedia", url: "https://en.wikipedia.org/wiki/The_Lord_of_the_Rings" }],
    });
    if (url.includes("/authors/OL1A")) return json({ name: "J. R. R. Tolkien", links: [{ title: "Tolkien Estate", url: "https://www.tolkienestate.com/" }] });
    if (url.includes("/series/OL1L")) return json({ name: "The Lord of the Rings", description: "Three volumes." });
    if (url.includes("series_key")) return json({ docs: [
      { key: "/works/OL3W", title: "The Two Towers", author_name: ["J. R. R. Tolkien"], cover_i: 3, first_publish_year: 1954 },
      { key: "/works/OL1W", title: "The Lord of the Rings", author_name: ["J. R. R. Tolkien"], cover_i: 99, first_publish_year: 1954 },
      { key: "/works/OL2W", title: "The Fellowship of the Ring", author_name: ["J. R. R. Tolkien"], cover_i: 2, first_publish_year: 1954 },
      { key: "/works/OL9W", title: "The Lord of the Rings (series) 1-3", author_name: ["J. R. R. Tolkien"], cover_i: 9, first_publish_year: 1954 },
    ] });
    if (url.includes("/works/OL2W")) return json({ title: "The Fellowship of the Ring", series: [{ series: { key: "/series/OL1L" }, position: "1" }] });
    if (url.includes("/works/OL3W")) return json({ title: "The Two Towers", series: [{ series: { key: "/series/OL1L" }, position: "2" }] });
    if (url.includes("author_key")) return json({ docs: [
      { key: "/works/OL1W", title: "The Lord of the Rings", author_name: ["J. R. R. Tolkien"], cover_i: 99, first_publish_year: 1954 },
      { key: "/works/OL2W", title: "The Fellowship of the Ring", author_name: ["J. R. R. Tolkien"], cover_i: 2, first_publish_year: 1954 },
      { key: "/works/OL8W", title: "The Hobbit", author_name: ["J. R. R. Tolkien"], cover_i: 8, first_publish_year: 1937 },
      { key: "/works/OL7W", title: "The Silmarillion", author_name: ["J. R. R. Tolkien"], cover_i: 7, first_publish_year: 1977 },
    ] });
    if (url.includes("subject=")) return json({ docs: [
      { key: "/works/OL1W", title: "The Lord of the Rings", author_name: ["J. R. R. Tolkien"], cover_i: 99, first_publish_year: 1954 },
      { key: "/works/OL2W", title: "The Fellowship of the Ring", author_name: ["J. R. R. Tolkien"], cover_i: 2, first_publish_year: 1954 },
      { key: "/works/OL8W", title: "The Hobbit", author_name: ["J. R. R. Tolkien"], cover_i: 8, first_publish_year: 1937 },
    ] });
    if (url.includes("wikipedia.org")) {
      const search = new URL(url).searchParams.get("search");
      const page = search === "J. R. R. Tolkien" ? "J._R._R._Tolkien" : "The_Lord_of_the_Rings";
      return json([search, [search], [""], [`https://en.wikipedia.org/wiki/${page}`]]);
    }
    if (url.includes("googleapis.com")) return json({ items: [{ volumeInfo: { title: "The Lord of the Rings", infoLink: "http://books.google.com/books?id=lotr" }, saleInfo: { saleability: "FOR_SALE", buyLink: "https://play.google.com/store/books/details?id=lotr" } }] });
    return { ok: false, json: async () => null };
  }) as typeof fetch;
  const previous = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY = "test-key";
  try {
    const page = await loadBookPage("/works/OL1W", undefined, fetchImpl);
    assert.equal(page?.book.title, "The Lord of the Rings");
    assert.equal(page?.book.author, "J. R. R. Tolkien");
    assert.equal(page?.book.year, 1954);
    assert.equal(page?.summary, "A full summary of the war of the ring.");
    assert.equal(page?.purchase[0]?.label, "Google Play");
    assert.equal(page?.series?.name, "The Lord of the Rings");
    assert.equal(page?.series?.position, "1-3");
    assert.equal(seriesPlace(page?.series?.name ?? "", page?.series?.position ?? null), "Books 1–3 of The Lord of the Rings");
    assert.deepEqual(page?.series?.books.map((item) => item.title), ["The Fellowship of the Ring", "The Two Towers"]);
    assert.deepEqual(page?.series?.books.map((item) => item.position), ["1", "2"]);
    assert.equal(page?.genre, "fantasy");
    assert.deepEqual(page?.authorBooks.map((item) => item.title), ["The Hobbit", "The Silmarillion"]);
    assert.deepEqual(page?.suggestions.map((item) => item.title), []);
    assert.equal(page?.authorLinks.some((link) => link.href.endsWith("/J._R._R._Tolkien")), true);
    assert.equal(page?.reading.some((link) => link.href.endsWith("/The_Lord_of_the_Rings")), true);
    assert.equal(calls.some((url) => url.includes("key=test-key")), true);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY = previous;
  }
});

test("genre suggestions prefer a named genre and skip collections", () => {
  assert.equal(chooseGenre(["form:novel", "genre:fantasy", "English literature"]), "fantasy");
  assert.equal(chooseGenre(["Ghosts", "Magic and Supernatural"]), "magic");
  assert.equal(chooseGenre(["Fiction", "English literature"]), null);
  assert.equal(isCollection("Harry Potter (series) 1-7"), true);
  assert.equal(isCollection("The Fellowship of the Ring"), false);
  assert.equal(seriesPlace("Harry Potter", "2"), "Book 2 of Harry Potter");
  const books = readRelated({ docs: [{ key: "/works/OL1W", title: "A real book", author_name: ["Ada"], cover_i: 4, first_publish_year: 1999 }] });
  assert.equal(books[0]?.coverId, 4);
});

test("a Wikipedia search result becomes a page link", () => {
  assert.equal(
    wikipediaUrl(["Susanna Clarke", ["Susanna Clarke"], [""], ["https://en.wikipedia.org/wiki/Susanna_Clarke"]]),
    "https://en.wikipedia.org/wiki/Susanna_Clarke",
  );
});
