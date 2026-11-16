import assert from "node:assert/strict";
import test from "node:test";
import type { LibraryHit } from "./books";
import { findBooks, keepsTypedWords, nearWords, rankHits } from "./search";

test("nearby spellings reach the intended title or author", () => {
  assert.ok(nearWords("piranasy").includes("piranesi"));
  assert.ok(nearWords("belovd").includes("beloved"));
  assert.ok(nearWords("tolkein").includes("tolkien"));
  assert.ok(nearWords("shakspeare").includes("shakespeare"));
  assert.equal(nearWords("cat").length, 0);
});

test("close titles rank ahead of unrelated books", () => {
  const hits: LibraryHit[] = [
    { id: "/works/OL1W", title: "The boy who swam with piranhas", author: "David Almond", year: 2012, coverId: null },
    { id: "/works/OL2W", title: "Piranesi", author: "Susanna Clarke", year: 2020, coverId: null },
    { id: "/works/OL3W", title: "The Hobbit", author: "J. R. R. Tolkien", year: 1937, coverId: null },
  ];
  assert.equal(rankHits("piranasy", hits)[0].title, "Piranesi");
  assert.equal(keepsTypedWords("piranasy", hits), false);
  assert.equal(keepsTypedWords("piranesi", [hits[1]]), true);
});

test("a matching title does not wait on a second spelling search", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      docs: [{ key: "/works/OL1W", title: "Circe", author_name: ["Madeline Miller"], cover_i: 1, first_publish_year: 2018 }],
    }), { status: 200 });
  };
  const result = await findBooks("circe", 6, undefined, fetchImpl);
  assert.equal(calls, 1);
  assert.equal(result.close, false);
  assert.equal(result.hits[0]?.title, "Circe");
});

test("findBooks merges a close spelling when the typed query misses", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    const query = new URL(url).searchParams.get("q") ?? "";
    const docs = query.includes("piranesi")
      ? [{ key: "/works/OL2W", title: "Piranesi", author_name: ["Susanna Clarke"], cover_i: 12, first_publish_year: 2020 }]
      : [];
    return new Response(JSON.stringify({ docs }), { status: 200 });
  };
  const result = await findBooks("piranasy", 6, undefined, fetchImpl);
  assert.equal(result.close, true);
  assert.equal(result.hits[0]?.title, "Piranesi");
});
