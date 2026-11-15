import assert from "node:assert/strict";
import test from "node:test";
import type { LibraryHit } from "./books";
import { createLocalBackend } from "./backend";

function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.assign(globalThis, { localStorage: storage, window: globalThis });
  storage.clear();
}

function hit(id: string, title: string): LibraryHit {
  return { id, title, author: "Toni Morrison", year: 1987, coverId: 8261367 };
}

test("a guest shelf survives a new page load until storage is cleared", async () => {
  memoryStorage();
  const first = createLocalBackend();
  first.subscribe(() => undefined);
  await first.saveBook(hit("/works/OL82563W", "Beloved"));
  await first.saveBook(hit("/works/OL82563W", "Beloved"));

  const reloaded = createLocalBackend();
  reloaded.subscribe(() => undefined);
  const books = await reloaded.books();
  assert.equal(books.length, 1);
  assert.equal(books[0]?.title, "Beloved");

  await reloaded.removeBook("/works/OL82563W");
  assert.equal((await reloaded.books()).length, 0);
});

test("creating an account keeps the guest shelf, and another reader cannot see it", async () => {
  memoryStorage();
  const guest = createLocalBackend();
  guest.subscribe(() => undefined);
  await guest.saveBook(hit("/works/OL82563W", "Beloved"));
  await guest.register("ada@example.com", "password1", "Ada");
  assert.equal((await guest.books()).map((book) => book.title).join(), "Beloved");

  await guest.signOut();
  assert.equal((await guest.books()).length, 0);
  await guest.saveBook(hit("/works/OL3W", "Piranesi"));
  await guest.signIn("ada@example.com", "password1");
  assert.deepEqual(
    (await guest.books()).map((book) => book.title).sort(),
    ["Beloved", "Piranesi"],
  );
  await guest.signOut();
  assert.equal((await guest.books()).length, 0);

  await guest.signOut();
  await guest.register("ben@example.com", "password2", "Ben");
  await guest.saveBook(hit("/works/OL3W", "Piranesi"));
  assert.deepEqual((await guest.books()).map((book) => book.title), ["Piranesi"]);
  await guest.signOut();
  await guest.signIn("ada@example.com", "password1");
  assert.deepEqual((await guest.books()).map((book) => book.title).sort(), ["Beloved", "Piranesi"]);

  await assert.rejects(() => guest.signIn("ada@example.com", "wrong-password"), /did not match/);
  await guest.signIn("ada@example.com", "password1");
  await assert.rejects(() => guest.register("ben@example.com", "password2", "Ada"), /already has an account/);
});

test("account names and short passwords are rejected", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  await assert.rejects(() => backend.register("a@example.com", "short", "Al"), /8 characters/);
  await assert.rejects(() => backend.register("a@example.com", "password1", "A"), /display name/);
});
