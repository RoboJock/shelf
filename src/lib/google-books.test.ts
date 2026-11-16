import assert from "node:assert/strict";
import test from "node:test";
import { chooseVolume, enrichBooks, fillGaps, readVolumes } from "./google-books";

const payload = {
  items: [
    {
      volumeInfo: {
        title: "Piranesi",
        authors: ["Susanna Clarke"],
        description: "<p>A house of endless halls.</p>",
        pageCount: 272,
        publisher: "Bloomsbury",
        publishedDate: "2020-09-15",
        categories: ["Fiction"],
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=abc&zoom=1" },
      },
    },
    {
      volumeInfo: {
        title: "Piranesi",
        authors: ["Giovanni Battista Piranesi"],
        description: "Etchings.",
        pageCount: 40,
        publishedDate: "1761",
      },
    },
  ],
};

test("Google volume details keep a description, pages, and a secure cover", () => {
  const volumes = readVolumes(payload);
  assert.equal(volumes[0]?.description, "A house of endless halls.");
  assert.equal(volumes[0]?.pages, 272);
  assert.equal(volumes[0]?.image, "https://books.google.com/books/content?id=abc&zoom=1");
  const chosen = chooseVolume("Piranesi", "Susanna Clarke", volumes);
  assert.equal(chosen?.description, "A house of endless halls.");
  assert.equal(chosen?.publisher, "Bloomsbury");
});

test("Open Library fields stay when Google knows the same book", () => {
  const facts = chooseVolume("Piranesi", "Susanna Clarke", readVolumes(payload));
  const filled = fillGaps({
    id: "/works/OL1W",
    title: "Piranesi",
    author: "Susanna Clarke",
    year: 2020,
    coverId: 12,
    description: null,
  }, facts);
  assert.equal(filled.title, "Piranesi");
  assert.equal(filled.author, "Susanna Clarke");
  assert.equal(filled.year, 2020);
  assert.equal(filled.coverId, 12);
  assert.equal(filled.image, null);
  assert.equal(filled.description, "A house of endless halls.");
  assert.equal(filled.pages, 272);
});

test("Google supplies a year and cover only when Open Library has neither", () => {
  const facts = chooseVolume("Piranesi", "Susanna Clarke", readVolumes(payload));
  const filled = fillGaps({ title: "Piranesi", author: "Unknown", year: null, coverId: null }, facts);
  assert.equal(filled.year, 2020);
  assert.equal(filled.image, "https://books.google.com/books/content?id=abc&zoom=1");
});

test("a weak title match does not attach another book's description", () => {
  assert.equal(chooseVolume("Circe", "Madeline Miller", readVolumes(payload)), null);
});

test("enrichBooks asks Google and leaves the Open Library title alone", async () => {
  const previous = process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY = "test-key";
  const calls: string[] = [];
  const books = await enrichBooks([{ title: "Beloved", author: "Toni Morrison", year: 1987, coverId: 4 }], undefined, async (input) => {
    calls.push(String(input));
    return {
      ok: true,
      json: async () => ({
        items: [{ volumeInfo: { title: "Beloved", authors: ["Toni Morrison"], description: "A novel.", pageCount: 324 } }],
      }),
    } as Response;
  });
  if (previous === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  else process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY = previous;
  assert.equal(books[0]?.title, "Beloved");
  assert.equal(books[0]?.year, 1987);
  assert.equal(books[0]?.coverId, 4);
  assert.equal(books[0]?.description, "A novel.");
  assert.match(calls[0] ?? "", /intitle/);
});
