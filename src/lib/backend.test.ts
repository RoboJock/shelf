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

test("a reader can keep named shelves and the same book on more than one", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  backend.subscribe(() => undefined);
  assert.equal((await backend.activeShelf()).name, "My shelf");
  await backend.saveBook(hit("/works/OL82563W", "Beloved"));
  const night = await backend.createShelf("Nightstand");
  assert.equal(night.name, "Nightstand");
  assert.equal((await backend.books()).length, 0);
  await backend.saveBook(hit("/works/OL82563W", "Beloved"));
  await backend.saveBook(hit("/works/OL3W", "Piranesi"));
  assert.deepEqual((await backend.books()).map((book) => book.title).sort(), ["Beloved", "Piranesi"]);
  await backend.renameShelf(night.id, "By the bed");
  assert.equal((await backend.activeShelf()).name, "By the bed");
  await backend.selectShelf((await backend.shelves()).find((shelf) => shelf.name === "My shelf")!.id);
  assert.deepEqual((await backend.books()).map((book) => book.title), ["Beloved"]);
  await assert.rejects(() => backend.renameShelf(night.id, "   "), /shelf name/);
  const shelves = await backend.shelves();
  await backend.deleteShelf(shelves.find((shelf) => shelf.name === "By the bed")!.id);
  assert.equal((await backend.shelves()).length, 1);
  const last = (await backend.activeShelf()).id;
  await assert.rejects(() => backend.deleteShelf(last), /at least one/);
});

test("a saved book goes on the shelf that was chosen", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  backend.subscribe(() => undefined);
  const night = await backend.createShelf("Nightstand");
  const mine = (await backend.shelves()).find((shelf) => shelf.name === "My shelf");
  assert.ok(mine);
  await backend.saveBook(hit("/works/OL82563W", "Beloved"), mine.id);
  await backend.saveBook(hit("/works/OL3W", "Piranesi"), night.id);
  assert.deepEqual((await backend.books(mine.id)).map((book) => book.title), ["Beloved"]);
  assert.deepEqual((await backend.books(night.id)).map((book) => book.title), ["Piranesi"]);
  await backend.removeBook("/works/OL3W", night.id);
  assert.equal((await backend.books(night.id)).length, 0);
  assert.equal((await backend.books(mine.id)).length, 1);
});

test("books saved before shelves existed stay on My shelf", async () => {
  memoryStorage();
  localStorage.setItem("shelf-local-v1", JSON.stringify({
    users: [],
    session: null,
    guestId: "guest-old",
    books: [{ id: "/works/OL82563W", owner: "guest-old", title: "Beloved", author: "Toni Morrison", year: 1987, coverId: 1, savedAt: 5 }],
  }));
  const backend = createLocalBackend();
  backend.subscribe(() => undefined);
  assert.equal((await backend.activeShelf()).name, "My shelf");
  assert.equal((await backend.books())[0]?.title, "Beloved");
});

test("sharing lets another reader look, and only the owner can change the shelf", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  backend.subscribe(() => undefined);
  await backend.register("ada@example.com", "password1", "Ada");
  const shelf = await backend.createShelf("Nightstand");
  await backend.saveBook(hit("/works/OL82563W", "Beloved"), shelf.id);
  await backend.signOut();
  await backend.register("ben@example.com", "password2", "Ben");
  await backend.signOut();
  await backend.signIn("ada@example.com", "password1");
  const shared = await backend.shareShelf(shelf.id, "Ben@Example.com");
  assert.equal(shared.name, "Ben");
  assert.deepEqual((await backend.viewers(shelf.id)).map((viewer) => viewer.email), ["ben@example.com"]);
  await assert.rejects(() => backend.shareShelf(shelf.id, "ada@example.com"), /already yours/);
  await assert.rejects(() => backend.shareShelf(shelf.id, "nope@example.com"), /No account/);
  await backend.signOut();
  await assert.rejects(() => backend.shareShelf(shelf.id, "ben@example.com"), /Sign in/);

  await backend.signIn("ben@example.com", "password2");
  const received = (await backend.shelves()).find((item) => item.access === "viewer");
  assert.ok(received);
  assert.equal(received.name, "Nightstand");
  assert.equal(received.ownerName, "Ada");
  assert.deepEqual((await backend.books(received.id, received.ownerId)).map((book) => book.title), ["Beloved"]);
  await assert.rejects(() => backend.renameShelf(received.id, "Stolen"), /made this shelf/);
  await assert.rejects(() => backend.deleteShelf(received.id), /made this shelf/);
  await assert.rejects(() => backend.removeBook("/works/OL82563W", received.id), /made this shelf/);
  await assert.rejects(() => backend.saveBook(hit("/works/OL3W", "Piranesi"), received.id), /made this shelf/);
  await assert.rejects(() => backend.shareShelf(received.id, "ada@example.com"), /made this shelf/);
  const ownerId = received.ownerId;
  await backend.signOut();

  await backend.signIn("ada@example.com", "password1");
  await backend.renameShelf(shelf.id, "By the bed");
  await backend.signOut();
  await backend.signIn("ben@example.com", "password2");
  assert.equal((await backend.shelves()).find((item) => item.access === "viewer")?.name, "By the bed");
  await backend.signOut();

  await backend.signIn("ada@example.com", "password1");
  await backend.unshareShelf(shelf.id, shared.id);
  await backend.signOut();
  await backend.signIn("ben@example.com", "password2");
  assert.equal((await backend.shelves()).some((item) => item.access === "viewer"), false);
  await assert.rejects(() => backend.books(shelf.id, ownerId), /not here/);
});

test("account names and short passwords are rejected", async () => {
  memoryStorage();
  const backend = createLocalBackend();
  await assert.rejects(() => backend.register("a@example.com", "short", "Al"), /8 characters/);
  await assert.rejects(() => backend.register("a@example.com", "password1", "A"), /display name/);
});
