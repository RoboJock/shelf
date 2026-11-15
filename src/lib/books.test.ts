import assert from "node:assert/strict";
import test from "node:test";
import { bookDocId, coverUrl, readBook, readSearch } from "./books";

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
