import assert from "node:assert/strict";
import test from "node:test";
import { bookDocId, coverUrl, readBook, readSearch, sortResults, sortShelf, type LibraryHit, type ShelfBook } from "./books";

test("search results keep works with a title and skip duplicates", () => {
  const hits = readSearch({
    docs: [
      { key: "/works/OL82563W", title: "Beloved", author_name: ["Toni Morrison"], cover_i: 8261367, first_publish_year: 1987 },
      { key: "/works/OL82563W", title: "Beloved", author_name: ["Toni Morrison"], cover_i: 1, first_publish_year: 1987 },
      { key: "/books/OL1M", title: "An edition" },
      { key: "/works/OL2W", title: "   ", author_name: ["Nobody"] },
      { key: "/works/OL3W", title: "Piranesi", author_name: [], cover_i: 0, first_publish_year: 0 },
    ],
  });
  assert.deepEqual(hits, [
    { id: "/works/OL82563W", title: "Beloved", author: "Toni Morrison", year: 1987, coverId: 8261367 },
    { id: "/works/OL3W", title: "Piranesi", author: "Unknown", year: null, coverId: null },
  ]);
  assert.equal(coverUrl(8261367), "https://covers.openlibrary.org/b/id/8261367-L.jpg");
  assert.equal(coverUrl(null), null);
  assert.equal(bookDocId("/works/OL82563W"), "OL82563W");
});

test("shelf order follows the chosen sort", () => {
  const books: ShelfBook[] = [
    { id: "b", title: "Piranesi", author: "Susanna Clarke", year: 2020, coverId: null, savedAt: 2 },
    { id: "a", title: "Beloved", author: "Toni Morrison", year: 1987, coverId: null, savedAt: 3 },
    { id: "c", title: "Circe", author: "Madeline Miller", year: 2018, coverId: null, savedAt: 1 },
  ];
  assert.deepEqual(sortShelf(books, "newest").map((book) => book.title), ["Beloved", "Piranesi", "Circe"]);
  assert.deepEqual(sortShelf(books, "oldest").map((book) => book.title), ["Circe", "Piranesi", "Beloved"]);
  assert.deepEqual(sortShelf(books, "title").map((book) => book.title), ["Beloved", "Circe", "Piranesi"]);
  assert.deepEqual(sortShelf(books, "title-desc").map((book) => book.title), ["Piranesi", "Circe", "Beloved"]);
  assert.deepEqual(sortShelf(books, "author").map((book) => book.author), ["Madeline Miller", "Susanna Clarke", "Toni Morrison"]);
});

test("search results sort by title, author, and year", () => {
  const hits: LibraryHit[] = [
    { id: "b", title: "Piranesi", author: "Susanna Clarke", year: 2020, coverId: null },
    { id: "a", title: "Beloved", author: "Toni Morrison", year: null, coverId: null },
    { id: "c", title: "Circe", author: "Madeline Miller", year: 2018, coverId: null },
  ];
  assert.deepEqual(sortResults(hits, "relevance").map((hit) => hit.title), ["Piranesi", "Beloved", "Circe"]);
  assert.deepEqual(sortResults(hits, "title").map((hit) => hit.title), ["Beloved", "Circe", "Piranesi"]);
  assert.deepEqual(sortResults(hits, "title-desc").map((hit) => hit.title), ["Piranesi", "Circe", "Beloved"]);
  assert.deepEqual(sortResults(hits, "author").map((hit) => hit.author), ["Madeline Miller", "Susanna Clarke", "Toni Morrison"]);
  assert.deepEqual(sortResults(hits, "author-desc").map((hit) => hit.author), ["Toni Morrison", "Susanna Clarke", "Madeline Miller"]);
  assert.deepEqual(sortResults(hits, "year").map((hit) => hit.title), ["Piranesi", "Circe", "Beloved"]);
  assert.deepEqual(sortResults(hits, "year-desc").map((hit) => hit.title), ["Circe", "Piranesi", "Beloved"]);
});

test("saved book documents need a work key and a title", () => {
  assert.equal(readBook("OL1W", { title: "Circe" }), null);
  const book = readBook("OL1W", {
    workKey: "/works/OL1W",
    title: "Circe",
    author: "Madeline Miller",
    year: 2018,
    coverId: 12,
    savedAt: 10,
  });
  assert.equal(book?.id, "/works/OL1W");
  assert.equal(book?.year, 2018);
});
