import assert from "node:assert/strict";
import test from "node:test";
import { sortShelf } from "./books";
import { publicHref, publicShelf, publicShelves } from "./public-shelves";

const expectedNames = [
  "Top rated",
  "New York Times bestsellers, 2025",
  "Fantasy",
  "Mystery",
  "Science fiction",
  "Horror",
  "Romance",
];

test("public shelves list real works under the expected names", () => {
  assert.deepEqual(publicShelves.map((shelf) => shelf.name), expectedNames);
  assert.equal(new Set(publicShelves.map((shelf) => shelf.id)).size, publicShelves.length);

  const books = publicShelves.flatMap((shelf) => shelf.books);
  assert.equal(new Set(books.map((book) => book.id)).size, books.length);
  for (const book of books) {
    assert.match(book.id, /^\/works\/OL\d+W$/);
    assert.ok(book.title.trim());
    assert.ok(book.author.trim());
    assert.equal(typeof book.year, "number");
    assert.ok(book.coverId && book.coverId > 0);
  }

  for (const id of ["fantasy", "mystery", "science-fiction", "horror", "romance"]) {
    const shelf = publicShelf(id);
    assert.ok(shelf, id);
    assert.ok(shelf.books.length >= 6 && shelf.books.length <= 8);
    assert.match(shelf.note, /first book/i);
  }

  for (const shelf of publicShelves) {
    assert.ok(shelf.books.length >= 6 && shelf.books.length <= 8, shelf.name);
    assert.deepEqual(sortShelf(shelf.books, "newest").map((book) => book.id), shelf.books.map((book) => book.id));
  }

  const nyt = publicShelf("nyt-2025");
  assert.ok(nyt);
  assert.match(nyt.note, /New York Times hardcover fiction list in 2025/);
  assert.deepEqual(nyt.books.map((book) => book.title), [
    "Fourth Wing",
    "The Nightingale",
    "James",
    "The Women",
    "Great Big Beautiful Life",
    "Atmosphere",
    "Never Flinch",
    "Alchemised",
  ]);
  assert.equal(publicShelf("missing"), null);
  assert.equal(publicHref("nyt-2025"), "/public?id=nyt-2025");
});
