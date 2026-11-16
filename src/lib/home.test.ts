import assert from "node:assert/strict";
import test from "node:test";
import { readRecent, rememberSearch } from "./recent";
import { collectInterests, pickSuggestions } from "./suggestions";

test("recent searches keep the newest title or author first", () => {
  const saved = new Map<string, string>();
  const store = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  };
  rememberSearch("Piranesi", store, 1);
  rememberSearch("  Susanna Clarke  ", store, 2);
  rememberSearch("piranesi", store, 3);
  const recent = readRecent(store);
  assert.deepEqual(recent.map((item) => item.text), ["piranesi", "Susanna Clarke"]);
  assert.equal(recent[0]?.at, 3);
});

test("suggestions follow shelf genres and authors and skip books already saved", () => {
  const interests = collectInterests([
    { id: "/works/OL1W", title: "Piranesi", author: "Susanna Clarke", categories: "fantasy · Labyrinths" },
    { id: "/works/OL2W", title: "Jonathan Strange & Mr Norrell", author: "Susanna Clarke", categories: "Fiction" },
  ]);
  assert.deepEqual(interests.genres, ["fantasy"]);
  assert.deepEqual(interests.authors, ["Susanna Clarke"]);
  const picked = pickSuggestions({
    genreBooks: [
      { id: "/works/OL1W", title: "Piranesi", author: "Susanna Clarke", year: 2020, coverId: 1, position: null },
      { id: "/works/OL3W", title: "The Blade Itself", author: "Joe Abercrombie", year: 2006, coverId: 2, position: null },
      { id: "/works/OL4W", title: "The Lies of Locke Lamora", author: "Scott Lynch", year: 2006, coverId: 3, position: null },
    ],
    authorBooks: [
      { id: "/works/OL2W", title: "Jonathan Strange & Mr Norrell", author: "Susanna Clarke", year: 2004, coverId: 4, position: null },
      { id: "/works/OL5W", title: "The Ladies of Grace Adieu", author: "Susanna Clarke", year: 2006, coverId: 5, position: null },
    ],
    savedIds: interests.savedIds,
    savedTitles: interests.savedTitles,
    savedAuthors: interests.savedAuthors,
  });
  assert.deepEqual(picked.books.map((book) => book.title), ["The Ladies of Grace Adieu", "The Blade Itself", "The Lies of Locke Lamora"]);
  assert.deepEqual(picked.authors, ["Joe Abercrombie", "Scott Lynch"]);
  const crowded = pickSuggestions({
    genreBooks: [{ id: "/works/OL3W", title: "The Blade Itself", author: "Joe Abercrombie", year: 2006, coverId: 2, position: null }],
    authorBooks: [1, 2, 3, 4].map((n) => ({ id: `/works/OL${n}0W`, title: n === 1 ? "Wood at Midwinter" : n === 2 ? "The Wood at Midwinter" : `Story ${n}`, author: "Susanna Clarke", year: 2000, coverId: n, position: null })),
    savedIds: ["/works/OL1W"],
    savedTitles: ["piranesi"],
    savedAuthors: ["susanna clarke"],
  });
  assert.deepEqual(crowded.books.map((book) => book.title), ["Wood at Midwinter", "Story 3", "Story 4", "The Blade Itself"]);
  assert.deepEqual(crowded.authors, ["Joe Abercrombie"]);
});
