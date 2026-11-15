import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { bookDocId, readBook, type LibraryHit, type ShelfBook } from "./books";

export interface BookShelf {
  id: string;
  name: string;
  createdAt: number;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  guest: boolean;
  provider: "guest" | "password";
}

export interface Backend {
  mode: "firebase" | "local";
  subscribe(listener: (user: AppUser | null) => void): () => void;
  register(email: string, password: string, name: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  shelves(): Promise<BookShelf[]>;
  activeShelf(): Promise<BookShelf>;
  selectShelf(id: string): Promise<void>;
  createShelf(name: string): Promise<BookShelf>;
  renameShelf(id: string, name: string): Promise<void>;
  deleteShelf(id: string): Promise<void>;
  saveBook(hit: LibraryHit): Promise<void>;
  removeBook(id: string): Promise<void>;
  books(): Promise<ShelfBook[]>;
}

export function firebasePublicConfig(): Record<string, string> | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ?? "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ?? "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() ?? "";
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  const config: Record<string, string> = { apiKey, authDomain, projectId, appId };
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const sender = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  if (bucket) config.storageBucket = bucket;
  if (sender) config.messagingSenderId = sender;
  return config;
}

function friendly(error: unknown): Error {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const text: Record<string, string> = {
    "auth/operation-not-allowed": "Email sign-in is turned off in the Firebase console.",
    "auth/email-already-in-use": "That email already has an account. Sign in instead.",
    "auth/invalid-credential": "Email or password did not match.",
    "auth/invalid-email": "That email address does not look valid.",
    "auth/weak-password": "Use at least 8 characters.",
    "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  };
  if (code && text[code]) return new Error(text[code]);
  if (error instanceof Error && error.message) return error;
  return new Error("Something went wrong. Try again.");
}

function asUser(user: User): AppUser {
  return {
    id: user.uid,
    name: user.displayName?.trim() || (user.isAnonymous ? "Guest" : "Reader"),
    email: user.email ?? "",
    guest: user.isAnonymous,
    provider: user.isAnonymous ? "guest" : "password",
  };
}

let firebaseApp: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

function services() {
  const config = firebasePublicConfig();
  if (!config) throw new Error("Firebase is not configured.");
  firebaseApp ??= initializeApp(config);
  auth ??= getAuth(firebaseApp);
  db ??= getFirestore(firebaseApp);
  return { auth, db };
}

const DEFAULT_SHELF_NAME = "My shelf";
const OPEN_KEY = "shelf-open-v1";

function cleanShelfName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 40) throw new Error("Use a shelf name between 1 and 40 characters.");
  return trimmed;
}

function rememberedOpen(owner: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "") as Record<string, unknown>;
    const value = parsed?.[owner];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

function rememberOpen(owner: string, shelfId: string) {
  if (typeof localStorage === "undefined") return;
  let parsed: Record<string, string> = {};
  try {
    const value = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "");
    if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (typeof item === "string") parsed[key] = item;
      }
    }
  } catch {
    parsed = {};
  }
  parsed[owner] = shelfId;
  localStorage.setItem(OPEN_KEY, JSON.stringify(parsed));
}

function chosenShelf(owner: string, shelves: BookShelf[]): BookShelf {
  const remembered = rememberedOpen(owner);
  return shelves.find((shelf) => shelf.id === remembered) ?? shelves[0];
}

function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 24) throw new Error("Use a display name between 2 and 24 characters.");
  return trimmed;
}

async function remember(user: User, name: string): Promise<void> {
  const { db: database } = services();
  await setDoc(
    doc(database, "users", user.uid),
    { name, guest: user.isAnonymous, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

function bookPayload(user: User, hit: LibraryHit, savedAt: number) {
  return {
    workKey: hit.id,
    title: hit.title.slice(0, 300),
    author: (hit.author || "Unknown").slice(0, 200),
    year: hit.year,
    coverId: hit.coverId,
    savedAt,
    uid: user.uid,
  };
}

async function remoteShelves(user: User): Promise<BookShelf[]> {
  const { db: database } = services();
  const shelfSnap = await getDocs(collection(database, "users", user.uid, "shelves"));
  let shelves: BookShelf[] = shelfSnap.docs.flatMap((item) => {
    const data = item.data();
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) return [];
    const createdAt = typeof data.createdAt === "number" && data.createdAt > 0 ? data.createdAt : Date.now();
    return [{ id: item.id, name, createdAt }];
  }).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  if (shelves.length === 0) {
    const createdAt = Date.now();
    await setDoc(doc(database, "users", user.uid, "shelves", "reading"), {
      name: DEFAULT_SHELF_NAME,
      createdAt,
      uid: user.uid,
    });
    shelves = [{ id: "reading", name: DEFAULT_SHELF_NAME, createdAt }];
  }
  const legacy = await getDocs(collection(database, "users", user.uid, "books"));
  const home = shelves[0];
  for (const item of legacy.docs) {
    const book = readBook(item.id, item.data());
    if (book) {
      await setDoc(doc(database, "users", user.uid, "shelves", home.id, "books", item.id), {
        ...item.data(),
        shelfId: home.id,
        uid: user.uid,
      });
    }
    await deleteDoc(item.ref);
  }
  return shelves;
}

async function adoptGuestBooks(user: User): Promise<void> {
  const { db: database } = services();
  const pending = takeGuestLibrary();
  if (pending.shelves.length === 0 && pending.books.length === 0) return;
  try {
    const existing = await getDocs(collection(database, "users", user.uid, "shelves"));
    const byName = new Map(existing.docs.map((item) => [String(item.data().name ?? "").toLowerCase(), item.id]));
    const idMap = new Map<string, string>();
    for (const shelf of pending.shelves) {
      const found = byName.get(shelf.name.toLowerCase());
      if (found) {
        idMap.set(shelf.id, found);
        continue;
      }
      const id = shelf.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || crypto.randomUUID();
      idMap.set(shelf.id, id);
      await setDoc(doc(database, "users", user.uid, "shelves", id), {
        name: shelf.name,
        createdAt: shelf.createdAt,
        uid: user.uid,
      });
      byName.set(shelf.name.toLowerCase(), id);
    }
    for (const book of pending.books) {
      const shelfId = idMap.get(book.shelfId);
      if (!shelfId) continue;
      await setDoc(doc(database, "users", user.uid, "shelves", shelfId, "books", bookDocId(book.id)), {
        workKey: book.id,
        title: book.title,
        author: book.author,
        year: book.year,
        coverId: book.coverId,
        savedAt: book.savedAt,
        uid: user.uid,
        shelfId,
      });
    }
  } catch (error) {
    restoreGuestLibrary(pending);
    throw error;
  }
}

export function createFirebaseBackend(): Backend {
  return {
    mode: "firebase",
    subscribe(listener) {
      const { auth: current } = services();
      return onAuthStateChanged(current, (user) => {
        listener(user ? asUser(user) : guestAccount());
      });
    },
    async register(email, password, name) {
      try {
        const { auth: current } = services();
        const display = cleanName(name);
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const created = await createUserWithEmailAndPassword(current, email.trim(), password);
        await updateProfile(created.user, { displayName: display });
        await remember(created.user, display);
        await adoptGuestBooks(created.user);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signIn(email, password) {
      try {
        const { auth: current } = services();
        const signed = await signInWithEmailAndPassword(current, email.trim(), password);
        const name = signed.user.displayName?.trim() || "Reader";
        if (signed.user.displayName) await remember(signed.user, name);
        await adoptGuestBooks(signed.user);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signOut() {
      try {
        const { auth: current } = services();
        await signOut(current);
      } catch (error) {
        throw friendly(error);
      }
    },
    async shelves() {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) return localShelves(guestOwner());
      return remoteShelves(user);
    },
    async activeShelf() {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) return localActive(guestOwner());
      const shelves = await remoteShelves(user);
      return chosenShelf(user.uid, shelves);
    },
    async selectShelf(id) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) {
        localSelect(guestOwner(), id);
        return;
      }
      const shelves = await remoteShelves(user);
      if (!shelves.some((shelf) => shelf.id === id)) throw new Error("That shelf is not here.");
      rememberOpen(user.uid, id);
    },
    async createShelf(name) {
      const display = cleanShelfName(name);
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return localCreate(guestOwner(), display);
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      await setDoc(doc(database, "users", user.uid, "shelves", id), { name: display, createdAt, uid: user.uid });
      rememberOpen(user.uid, id);
      return { id, name: display, createdAt };
    },
    async renameShelf(id, name) {
      const display = cleanShelfName(name);
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localRename(guestOwner(), id, display);
        return;
      }
      const ref = doc(database, "users", user.uid, "shelves", id);
      const existing = await getDoc(ref);
      if (!existing.exists()) throw new Error("That shelf is not here.");
      await setDoc(ref, { name: display }, { merge: true });
    },
    async deleteShelf(id) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localDelete(guestOwner(), id);
        return;
      }
      const shelves = await remoteShelves(user);
      if (shelves.length < 2) throw new Error("Keep at least one shelf.");
      if (!shelves.some((shelf) => shelf.id === id)) throw new Error("That shelf is not here.");
      const books = await getDocs(collection(database, "users", user.uid, "shelves", id, "books"));
      for (const item of books.docs) await deleteDoc(item.ref);
      await deleteDoc(doc(database, "users", user.uid, "shelves", id));
      if (chosenShelf(user.uid, shelves).id === id) {
        const next = shelves.find((shelf) => shelf.id !== id);
        if (next) rememberOpen(user.uid, next.id);
      }
    },
    async saveBook(hit) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) {
        localSave(guestOwner(), hit);
        return;
      }
      if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
      const { db: database } = services();
      const shelves = await remoteShelves(user);
      const currentShelf = chosenShelf(user.uid, shelves);
      const ref = doc(database, "users", user.uid, "shelves", currentShelf.id, "books", bookDocId(hit.id));
      if ((await getDoc(ref)).exists()) return;
      const name = user.displayName?.trim() || "Reader";
      await setDoc(doc(database, "users", user.uid), { name, guest: false, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(ref, { ...bookPayload(user, hit, Date.now()), shelfId: currentShelf.id });
    },
    async removeBook(id) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localRemove(guestOwner(), id);
        return;
      }
      const shelves = await remoteShelves(user);
      const currentShelf = chosenShelf(user.uid, shelves);
      await deleteDoc(doc(database, "users", user.uid, "shelves", currentShelf.id, "books", bookDocId(id)));
    },
    async books() {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return localBooks(guestOwner());
      const shelves = await remoteShelves(user);
      const currentShelf = chosenShelf(user.uid, shelves);
      const snap = await getDocs(query(collection(database, "users", user.uid, "shelves", currentShelf.id, "books"), orderBy("savedAt", "desc")));
      return snap.docs.flatMap((item) => {
        const book = readBook(item.id, item.data());
        return book ? [book] : [];
      });
    },
  };
}

const LOCAL_KEY = "shelf-local-v1";

interface LocalUser {
  id: string;
  email: string;
  name: string;
  salt: string;
  hash: string;
}

interface LocalShelf {
  id: string;
  owner: string;
  name: string;
  createdAt: number;
}

interface LocalBook extends ShelfBook {
  owner: string;
  shelfId: string;
}

interface LocalState {
  users: LocalUser[];
  session: string | null;
  guestId: string;
  shelves: LocalShelf[];
  books: LocalBook[];
  active: Record<string, string>;
}

function blankLocal(): LocalState {
  return { users: [], session: null, guestId: "", shelves: [], books: [], active: {} };
}

function readLocal(): LocalState {
  if (typeof window === "undefined") return blankLocal();
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "") as Partial<LocalState>;
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.books)) return blankLocal();
    const state: LocalState = {
      users: parsed.users,
      session: typeof parsed.session === "string" ? parsed.session : null,
      guestId: typeof parsed.guestId === "string" ? parsed.guestId : "",
      shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
      books: parsed.books.map((book) => ({ ...book, shelfId: typeof book.shelfId === "string" ? book.shelfId : "" })),
      active: parsed.active && typeof parsed.active === "object" ? parsed.active : {},
    };
    let changed = !Array.isArray(parsed.shelves) || parsed.books.some((book) => typeof book.shelfId !== "string");
    for (const book of state.books) {
      if (book.shelfId) continue;
      book.shelfId = ensureOwnerShelf(state, book.owner).id;
      changed = true;
    }
    if (changed) writeLocal(state);
    return state;
  } catch {
    return blankLocal();
  }
}

function writeLocal(state: LocalState) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

function ensureGuest(state: LocalState): LocalState {
  if (state.guestId) return state;
  state.guestId = `guest-${crypto.randomUUID()}`;
  writeLocal(state);
  return state;
}

function guestAccount(): AppUser {
  const state = ensureGuest(readLocal());
  return { id: state.guestId, name: "Guest", email: "", guest: true, provider: "guest" };
}

function guestOwner(): string {
  return ensureGuest(readLocal()).guestId;
}

function ensureOwnerShelf(state: LocalState, owner: string): LocalShelf {
  const owned = state.shelves.filter((shelf) => shelf.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
  if (owned.length > 0) return owned[0];
  const shelf: LocalShelf = { id: `reading-${owner}`.slice(0, 80), owner, name: DEFAULT_SHELF_NAME, createdAt: Date.now() };
  state.shelves.push(shelf);
  return shelf;
}

function ownerShelves(owner: string): BookShelf[] {
  const state = ensureGuest(readLocal());
  ensureOwnerShelf(state, owner);
  writeLocal(state);
  return state.shelves
    .filter((shelf) => shelf.owner === owner)
    .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
    .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

function localShelves(owner: string): BookShelf[] {
  return ownerShelves(owner);
}

function localActive(owner: string): BookShelf {
  const shelves = ownerShelves(owner);
  const state = readLocal();
  const chosen = state.active[owner];
  return shelves.find((shelf) => shelf.id === chosen) ?? shelves[0];
}

function localSelect(owner: string, id: string) {
  const state = ensureGuest(readLocal());
  ensureOwnerShelf(state, owner);
  if (!state.shelves.some((shelf) => shelf.owner === owner && shelf.id === id)) throw new Error("That shelf is not here.");
  state.active[owner] = id;
  writeLocal(state);
}

function localCreate(owner: string, name: string): BookShelf {
  const state = ensureGuest(readLocal());
  ensureOwnerShelf(state, owner);
  const shelf: LocalShelf = { id: crypto.randomUUID(), owner, name, createdAt: Date.now() };
  state.shelves.push(shelf);
  state.active[owner] = shelf.id;
  writeLocal(state);
  return { id: shelf.id, name: shelf.name, createdAt: shelf.createdAt };
}

function localRename(owner: string, id: string, name: string) {
  const state = ensureGuest(readLocal());
  const shelf = state.shelves.find((item) => item.owner === owner && item.id === id);
  if (!shelf) throw new Error("That shelf is not here.");
  shelf.name = name;
  writeLocal(state);
}

function localDelete(owner: string, id: string) {
  const state = ensureGuest(readLocal());
  const owned = state.shelves.filter((shelf) => shelf.owner === owner);
  if (owned.length < 2) throw new Error("Keep at least one shelf.");
  if (!owned.some((shelf) => shelf.id === id)) throw new Error("That shelf is not here.");
  state.shelves = state.shelves.filter((shelf) => !(shelf.owner === owner && shelf.id === id));
  state.books = state.books.filter((book) => !(book.owner === owner && book.shelfId === id));
  if (state.active[owner] === id) {
    const next = state.shelves.find((shelf) => shelf.owner === owner);
    if (next) state.active[owner] = next.id;
  }
  writeLocal(state);
}

function localBooks(owner: string): ShelfBook[] {
  const state = ensureGuest(readLocal());
  const shelf = localActive(owner);
  return state.books
    .filter((book) => book.owner === owner && book.shelfId === shelf.id)
    .sort((a, b) => b.savedAt - a.savedAt);
}

function localSave(owner: string, hit: LibraryHit) {
  if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
  const state = ensureGuest(readLocal());
  const shelf = ensureOwnerShelf(state, owner);
  const activeId = state.shelves.some((item) => item.owner === owner && item.id === state.active[owner]) ? state.active[owner] : shelf.id;
  if (state.books.some((book) => book.owner === owner && book.shelfId === activeId && book.id === hit.id)) return;
  state.books.push({
    id: hit.id,
    owner,
    shelfId: activeId,
    title: hit.title.slice(0, 300),
    author: (hit.author || "Unknown").slice(0, 200),
    year: hit.year,
    coverId: hit.coverId,
    savedAt: Date.now(),
  });
  writeLocal(state);
}

function localRemove(owner: string, id: string) {
  const state = ensureGuest(readLocal());
  const shelf = localActive(owner);
  state.books = state.books.filter((book) => !(book.owner === owner && book.shelfId === shelf.id && book.id === id));
  writeLocal(state);
}

function takeGuestLibrary(): { shelves: BookShelf[]; books: (ShelfBook & { shelfId: string })[] } {
  const state = ensureGuest(readLocal());
  const owner = state.guestId;
  ensureOwnerShelf(state, owner);
  const shelves = state.shelves.filter((shelf) => shelf.owner === owner).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
  const books = state.books.filter((book) => book.owner === owner).map(({ owner: _owner, ...book }) => book);
  state.shelves = state.shelves.filter((shelf) => shelf.owner !== owner);
  state.books = state.books.filter((book) => book.owner !== owner);
  delete state.active[owner];
  writeLocal(state);
  return { shelves, books };
}

function restoreGuestLibrary(library: { shelves: BookShelf[]; books: (ShelfBook & { shelfId: string })[] }) {
  const state = ensureGuest(readLocal());
  const owner = state.guestId;
  for (const shelf of library.shelves) {
    if (state.shelves.some((item) => item.owner === owner && item.id === shelf.id)) continue;
    state.shelves.push({ ...shelf, owner });
  }
  for (const book of library.books) {
    if (state.books.some((item) => item.owner === owner && item.shelfId === book.shelfId && item.id === book.id)) continue;
    state.books.push({ ...book, owner });
  }
  writeLocal(state);
}

function claimGuestBooks(accountId: string) {
  const state = ensureGuest(readLocal());
  if (state.guestId === accountId) return;
  ensureOwnerShelf(state, state.guestId);
  ensureOwnerShelf(state, accountId);
  for (const shelf of state.shelves.filter((item) => item.owner === state.guestId)) {
    const same = state.shelves.find((item) => item.owner === accountId && item.name.toLowerCase() === shelf.name.toLowerCase());
    const targetId = same ? same.id : shelf.id;
    if (!same) shelf.owner = accountId;
    for (const book of state.books) {
      if (book.owner !== state.guestId || book.shelfId !== shelf.id) continue;
      const duplicate = state.books.some((item) => item.owner === accountId && item.shelfId === targetId && item.id === book.id);
      if (duplicate) continue;
      book.owner = accountId;
      book.shelfId = targetId;
    }
  }
  state.shelves = state.shelves.filter((shelf) => shelf.owner !== state.guestId);
  state.books = state.books.filter((book) => book.owner !== state.guestId);
  delete state.active[state.guestId];
  writeLocal(state);
}

async function digest(salt: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createLocalBackend(): Backend {
  const listeners = new Set<(user: AppUser | null) => void>();

  function current(): AppUser {
    const state = ensureGuest(readLocal());
    const account = state.users.find((user) => user.id === state.session);
    if (!account) return { id: state.guestId, name: "Guest", email: "", guest: true, provider: "guest" };
    return { id: account.id, name: account.name, email: account.email, guest: false, provider: "password" };
  }

  function emit() {
    const user = current();
    listeners.forEach((listener) => listener(user));
  }

  return {
    mode: "local",
    subscribe(listener) {
      listeners.add(listener);
      listener(current());
      return () => listeners.delete(listener);
    },
    async register(email, password, name) {
      const display = cleanName(name);
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      const state = ensureGuest(readLocal());
      const me = current();
      if (state.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error("That email already has an account. Sign in instead.");
      }
      const salt = crypto.randomUUID();
      const id = crypto.randomUUID();
      state.users.push({ id, email: email.trim(), name: display, salt, hash: await digest(salt, password) });
      state.session = id;
      writeLocal(state);
      if (me.guest) claimGuestBooks(id);
      emit();
    },
    async shelves() {
      return localShelves(current().id);
    },
    async activeShelf() {
      return localActive(current().id);
    },
    async selectShelf(id) {
      localSelect(current().id, id);
    },
    async createShelf(name) {
      return localCreate(current().id, cleanShelfName(name));
    },
    async renameShelf(id, name) {
      localRename(current().id, id, cleanShelfName(name));
    },
    async deleteShelf(id) {
      localDelete(current().id, id);
    },
    async signIn(email, password) {
      const state = ensureGuest(readLocal());
      const account = state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
      if (!account || (await digest(account.salt, password)) !== account.hash) {
        throw new Error("Email or password did not match.");
      }
      state.session = account.id;
      writeLocal(state);
      claimGuestBooks(account.id);
      emit();
    },
    async signOut() {
      const state = ensureGuest(readLocal());
      state.session = null;
      writeLocal(state);
      emit();
    },
    async saveBook(hit) {
      localSave(current().id, hit);
    },
    async removeBook(id) {
      localRemove(current().id, id);
    },
    async books() {
      return localBooks(current().id);
    },
  };
}

function createResilientBackend(): Backend {
  const remote = createFirebaseBackend();
  const local = createLocalBackend();
  let active: Backend = remote;
  return {
    get mode() {
      return active.mode;
    },
    subscribe(listener) {
      let stopLocal: (() => void) | undefined;
      const stopRemote = remote.subscribe((user) => {
        if (user) {
          listener(user);
          return;
        }
        if (active === local) return;
        active = local;
        stopLocal = local.subscribe(listener);
      });
      return () => {
        stopRemote();
        stopLocal?.();
      };
    },
    register: (...args) => active.register(...args),
    signIn: (...args) => active.signIn(...args),
    signOut: () => active.signOut(),
    shelves: () => active.shelves(),
    activeShelf: () => active.activeShelf(),
    selectShelf: (id) => active.selectShelf(id),
    createShelf: (name) => active.createShelf(name),
    renameShelf: (id, name) => active.renameShelf(id, name),
    deleteShelf: (id) => active.deleteShelf(id),
    saveBook: (hit) => active.saveBook(hit),
    removeBook: (id) => active.removeBook(id),
    books: () => active.books(),
  };
}

export function createBackend(): Backend {
  return firebasePublicConfig() ? createResilientBackend() : createLocalBackend();
}
