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
  ownerId: string;
  ownerName: string;
  access: "owner" | "viewer";
}

export interface ShelfViewer {
  id: string;
  name: string;
  email: string;
}

export function shelfHref(shelf: Pick<BookShelf, "id" | "access" | "ownerId">): string {
  const id = encodeURIComponent(shelf.id);
  if (shelf.access === "viewer") return `/shelf?id=${id}&owner=${encodeURIComponent(shelf.ownerId)}`;
  return `/shelf?id=${id}`;
}

const VIEW_ONLY = "Only the person who made this shelf can change it.";

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
  saveBook(hit: LibraryHit, shelfId?: string): Promise<void>;
  removeBook(id: string, shelfId?: string): Promise<void>;
  books(shelfId?: string, ownerId?: string): Promise<ShelfBook[]>;
  shareShelf(shelfId: string, email: string): Promise<ShelfViewer>;
  viewers(shelfId: string): Promise<ShelfViewer[]>;
  unshareShelf(shelfId: string, viewerId: string): Promise<void>;
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
    "permission-denied": "You do not have access to that.",
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
  const email = user.email?.trim().toLowerCase();
  if (!email) return;
  await setDoc(doc(database, "directory", email), { uid: user.uid, name }, { merge: true });
}

function ownedShelf(id: string, name: string, createdAt: number, ownerId: string, ownerName: string): BookShelf {
  return { id, name, createdAt, ownerId, ownerName, access: "owner" };
}

function displayName(user: User): string {
  return user.displayName?.trim() || "Reader";
}

function shareAddress(email: string): string {
  const address = email.trim().toLowerCase();
  if (!address.includes("@") || address.length > 120) throw new Error("Enter the email they use for Armarium.");
  return address;
}

function shareDocId(ownerId: string, shelfId: string): string {
  return `${ownerId}_${shelfId}`;
}

function bookPayload(user: User, hit: LibraryHit, savedAt: number) {
  return {
    workKey: hit.id,
    title: hit.title.slice(0, 300),
    author: (hit.author || "Unknown").slice(0, 200),
    year: hit.year,
    coverId: hit.coverId,
    description: hit.description ?? null,
    pages: hit.pages ?? null,
    publisher: hit.publisher ?? null,
    categories: hit.categories ?? null,
    image: hit.image ?? null,
    savedAt,
    uid: user.uid,
  };
}

async function remoteShared(user: User): Promise<BookShelf[]> {
  const { db: database } = services();
  const inbox = await getDocs(collection(database, "inbox", user.uid, "shelves"));
  return inbox.docs.flatMap((item) => {
    const data = item.data();
    const id = typeof data.shelfId === "string" ? data.shelfId : "";
    const ownerId = typeof data.ownerUid === "string" ? data.ownerUid : "";
    const name = typeof data.shelfName === "string" ? data.shelfName.trim() : "";
    if (!id || !ownerId || !name || ownerId === user.uid) return [];
    const createdAt = typeof data.sharedAt === "number" && data.sharedAt > 0 ? data.sharedAt : 0;
    const ownerName = typeof data.ownerName === "string" && data.ownerName.trim() ? data.ownerName.trim() : "Reader";
    return [{ id, name, createdAt, ownerId, ownerName, access: "viewer" as const }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function remoteShelves(user: User): Promise<BookShelf[]> {
  const { db: database } = services();
  const shelfSnap = await getDocs(collection(database, "users", user.uid, "shelves"));
  const ownerName = displayName(user);
  let shelves: BookShelf[] = shelfSnap.docs.flatMap((item) => {
    const data = item.data();
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) return [];
    const createdAt = typeof data.createdAt === "number" && data.createdAt > 0 ? data.createdAt : Date.now();
    return [ownedShelf(item.id, name, createdAt, user.uid, ownerName)];
  }).sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  if (shelves.length === 0) {
    const createdAt = Date.now();
    await setDoc(doc(database, "users", user.uid, "shelves", "reading"), {
      name: DEFAULT_SHELF_NAME,
      createdAt,
      uid: user.uid,
    });
    shelves = [ownedShelf("reading", DEFAULT_SHELF_NAME, createdAt, user.uid, ownerName)];
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
        await remember(signed.user, name);
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
      const [owned, shared] = await Promise.all([remoteShelves(user), remoteShared(user)]);
      return [...owned, ...shared];
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
      return ownedShelf(id, display, createdAt, user.uid, displayName(user));
    },
    async renameShelf(id, name) {
      const display = cleanShelfName(name);
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localRename(guestOwner(), id, display);
        return;
      }
      await requireOwned(user, id);
      const ref = doc(database, "users", user.uid, "shelves", id);
      await setDoc(ref, { name: display }, { merge: true });
      const people = await getDocs(collection(database, "users", user.uid, "shelves", id, "viewers"));
      for (const person of people.docs) {
        await setDoc(doc(database, "inbox", person.id, "shelves", shareDocId(user.uid, id)), { shelfName: display }, { merge: true });
      }
    },
    async deleteShelf(id) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localDelete(guestOwner(), id);
        return;
      }
      await requireOwned(user, id);
      const shelves = await remoteShelves(user);
      if (shelves.length < 2) throw new Error("Keep at least one shelf.");
      const people = await getDocs(collection(database, "users", user.uid, "shelves", id, "viewers"));
      for (const person of people.docs) {
        await deleteDoc(person.ref);
        await deleteDoc(doc(database, "inbox", person.id, "shelves", shareDocId(user.uid, id)));
      }
      const books = await getDocs(collection(database, "users", user.uid, "shelves", id, "books"));
      for (const item of books.docs) await deleteDoc(item.ref);
      await deleteDoc(doc(database, "users", user.uid, "shelves", id));
      if (chosenShelf(user.uid, shelves).id === id) {
        const next = shelves.find((shelf) => shelf.id !== id);
        if (next) rememberOpen(user.uid, next.id);
      }
    },
    async saveBook(hit, shelfId) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) {
        localSave(guestOwner(), hit, shelfId);
        return;
      }
      if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
      const { db: database } = services();
      const shelves = await remoteShelves(user);
      const currentShelf = shelfId ? await requireOwned(user, shelfId) : chosenShelf(user.uid, shelves);
      const ref = doc(database, "users", user.uid, "shelves", currentShelf.id, "books", bookDocId(hit.id));
      if ((await getDoc(ref)).exists()) return;
      const name = user.displayName?.trim() || "Reader";
      await setDoc(doc(database, "users", user.uid), { name, guest: false, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(ref, { ...bookPayload(user, hit, Date.now()), shelfId: currentShelf.id });
    },
    async removeBook(id, shelfId) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) {
        localRemove(guestOwner(), id, shelfId);
        return;
      }
      const shelves = await remoteShelves(user);
      const currentShelf = shelfId ? await requireOwned(user, shelfId) : chosenShelf(user.uid, shelves);
      await deleteDoc(doc(database, "users", user.uid, "shelves", currentShelf.id, "books", bookDocId(id)));
    },
    async books(shelfId, ownerId) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return localBooks(guestOwner(), shelfId, ownerId);
      if (ownerId && ownerId !== user.uid) {
        if (!shelfId) throw new Error("That shelf is not here.");
        return sharedBooks(ownerId, shelfId);
      }
      const shelves = await remoteShelves(user);
      const currentShelf = shelfId ? shelves.find((shelf) => shelf.id === shelfId) : chosenShelf(user.uid, shelves);
      if (!currentShelf) throw new Error("That shelf is not here.");
      const snap = await getDocs(query(collection(database, "users", user.uid, "shelves", currentShelf.id, "books"), orderBy("savedAt", "desc")));
      return snap.docs.flatMap((item) => {
        const book = readBook(item.id, item.data());
        return book ? [book] : [];
      });
    },
    async shareShelf(shelfId, email) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) throw new Error("Sign in to share a shelf.");
      try {
        return await grantShelf(user, shelfId, email);
      } catch (error) {
        throw friendly(error);
      }
    },
    async viewers(shelfId) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) throw new Error("Sign in to share a shelf.");
      try {
        return await listViewers(user, shelfId);
      } catch (error) {
        throw friendly(error);
      }
    },
    async unshareShelf(shelfId, viewerId) {
      const { auth: current } = services();
      const user = current.currentUser;
      if (!user) throw new Error("Sign in to share a shelf.");
      try {
        await revokeShelf(user, shelfId, viewerId);
      } catch (error) {
        throw friendly(error);
      }
    },
  };
}

async function requireOwned(user: User, shelfId: string): Promise<BookShelf> {
  const shelves = await remoteShelves(user);
  const shelf = shelves.find((item) => item.id === shelfId);
  if (shelf) return shelf;
  const shared = await remoteShared(user);
  if (shared.some((item) => item.id === shelfId)) throw new Error(VIEW_ONLY);
  throw new Error("That shelf is not here.");
}

async function sharedBooks(ownerId: string, shelfId: string): Promise<ShelfBook[]> {
  const { db: database } = services();
  try {
    const shelf = await getDoc(doc(database, "users", ownerId, "shelves", shelfId));
    if (!shelf.exists()) throw new Error("That shelf is not here.");
    const snap = await getDocs(query(collection(database, "users", ownerId, "shelves", shelfId, "books"), orderBy("savedAt", "desc")));
    return snap.docs.flatMap((item) => {
      const book = readBook(item.id, item.data());
      return book ? [book] : [];
    });
  } catch (error) {
    throw friendly(error);
  }
}

async function grantShelf(user: User, shelfId: string, email: string): Promise<ShelfViewer> {
  const address = shareAddress(email);
  if (user.email && address === user.email.trim().toLowerCase()) throw new Error("That shelf is already yours.");
  const { db: database } = services();
  const shelf = await requireOwned(user, shelfId);
  const found = await getDoc(doc(database, "directory", address));
  if (!found.exists()) throw new Error("No account uses that email yet. They need to sign in on Armarium before you can share with them.");
  const data = found.data();
  const viewerId = typeof data.uid === "string" ? data.uid : "";
  const viewerName = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Reader";
  if (!viewerId || viewerId === user.uid) throw new Error("That shelf is already yours.");
  const current = await getDocs(collection(database, "users", user.uid, "shelves", shelfId, "viewers"));
  if (current.size >= 20 && !current.docs.some((item) => item.id === viewerId)) {
    throw new Error("This shelf is already shared with 20 people.");
  }
  await setDoc(doc(database, "users", user.uid, "shelves", shelfId, "viewers", viewerId), { email: address, name: viewerName });
  await setDoc(doc(database, "inbox", viewerId, "shelves", shareDocId(user.uid, shelfId)), {
    ownerUid: user.uid,
    ownerName: displayName(user),
    viewerUid: viewerId,
    shelfId,
    shelfName: shelf.name,
    sharedAt: Date.now(),
  });
  return { id: viewerId, name: viewerName, email: address };
}

async function listViewers(user: User, shelfId: string): Promise<ShelfViewer[]> {
  await requireOwned(user, shelfId);
  const { db: database } = services();
  const snap = await getDocs(collection(database, "users", user.uid, "shelves", shelfId, "viewers"));
  return snap.docs.flatMap((item) => {
    const data = item.data();
    const email = typeof data.email === "string" ? data.email : "";
    const name = typeof data.name === "string" ? data.name : "Reader";
    if (!email) return [];
    return [{ id: item.id, name, email }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function revokeShelf(user: User, shelfId: string, viewerId: string): Promise<void> {
  await requireOwned(user, shelfId);
  const { db: database } = services();
  await deleteDoc(doc(database, "users", user.uid, "shelves", shelfId, "viewers", viewerId));
  await deleteDoc(doc(database, "inbox", viewerId, "shelves", shareDocId(user.uid, shelfId)));
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

interface LocalShare {
  ownerId: string;
  shelfId: string;
  viewerId: string;
  viewerEmail: string;
  viewerName: string;
}

interface LocalState {
  users: LocalUser[];
  session: string | null;
  guestId: string;
  shelves: LocalShelf[];
  books: LocalBook[];
  shares: LocalShare[];
  active: Record<string, string>;
}

function blankLocal(): LocalState {
  return { users: [], session: null, guestId: "", shelves: [], books: [], shares: [], active: {} };
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
      shares: Array.isArray(parsed.shares) ? parsed.shares.flatMap((share) => {
        if (!share || typeof share !== "object") return [];
        const item = share as Partial<LocalShare>;
        if (typeof item.ownerId !== "string" || typeof item.shelfId !== "string" || typeof item.viewerId !== "string") return [];
        if (typeof item.viewerEmail !== "string" || typeof item.viewerName !== "string") return [];
        return [{ ownerId: item.ownerId, shelfId: item.shelfId, viewerId: item.viewerId, viewerEmail: item.viewerEmail, viewerName: item.viewerName }];
      }) : [],
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

function personName(state: LocalState, id: string): string {
  if (id === state.guestId) return "Guest";
  return state.users.find((user) => user.id === id)?.name || "Reader";
}

function asOwned(state: LocalState, shelf: LocalShelf): BookShelf {
  return ownedShelf(shelf.id, shelf.name, shelf.createdAt, shelf.owner, personName(state, shelf.owner));
}

function ownerShelves(owner: string): BookShelf[] {
  const state = ensureGuest(readLocal());
  ensureOwnerShelf(state, owner);
  writeLocal(state);
  return state.shelves
    .filter((shelf) => shelf.owner === owner)
    .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name))
    .map((shelf) => asOwned(state, shelf));
}

function localShelves(owner: string): BookShelf[] {
  const state = readLocal();
  const shared = state.shares.filter((share) => share.viewerId === owner).flatMap((share) => {
    const shelf = state.shelves.find((item) => item.owner === share.ownerId && item.id === share.shelfId);
    if (!shelf) return [];
    return [{
      id: shelf.id,
      name: shelf.name,
      createdAt: shelf.createdAt,
      ownerId: shelf.owner,
      ownerName: personName(state, shelf.owner),
      access: "viewer" as const,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return [...ownerShelves(owner), ...shared];
}

function assertCanChange(owner: string, shelfId: string) {
  const state = readLocal();
  if (state.shelves.some((shelf) => shelf.owner === owner && shelf.id === shelfId)) return;
  if (state.shares.some((share) => share.viewerId === owner && share.shelfId === shelfId)) throw new Error(VIEW_ONLY);
  throw new Error("That shelf is not here.");
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
  return asOwned(state, shelf);
}

function localRename(owner: string, id: string, name: string) {
  assertCanChange(owner, id);
  const state = ensureGuest(readLocal());
  const shelf = state.shelves.find((item) => item.owner === owner && item.id === id);
  if (!shelf) throw new Error("That shelf is not here.");
  shelf.name = name;
  writeLocal(state);
}

function localDelete(owner: string, id: string) {
  assertCanChange(owner, id);
  const state = ensureGuest(readLocal());
  const owned = state.shelves.filter((shelf) => shelf.owner === owner);
  if (owned.length < 2) throw new Error("Keep at least one shelf.");
  state.shelves = state.shelves.filter((shelf) => !(shelf.owner === owner && shelf.id === id));
  state.books = state.books.filter((book) => !(book.owner === owner && book.shelfId === id));
  state.shares = state.shares.filter((share) => !(share.ownerId === owner && share.shelfId === id));
  if (state.active[owner] === id) {
    const next = state.shelves.find((shelf) => shelf.owner === owner);
    if (next) state.active[owner] = next.id;
  }
  writeLocal(state);
}

function chosenLocalShelf(owner: string, shelfId?: string): string {
  const shelves = ownerShelves(owner);
  if (shelfId) {
    assertCanChange(owner, shelfId);
    return shelfId;
  }
  const state = readLocal();
  return shelves.some((shelf) => shelf.id === state.active[owner]) ? state.active[owner] : shelves[0].id;
}

function localBooks(owner: string, shelfId?: string, ownerId?: string): ShelfBook[] {
  if (ownerId && ownerId !== owner) {
    const state = readLocal();
    const allowed = Boolean(shelfId) && state.shares.some((share) => share.viewerId === owner && share.ownerId === ownerId && share.shelfId === shelfId);
    if (!allowed || !shelfId) throw new Error("That shelf is not here.");
    return state.books
      .filter((book) => book.owner === ownerId && book.shelfId === shelfId)
      .sort((a, b) => b.savedAt - a.savedAt);
  }
  const id = chosenLocalShelf(owner, shelfId);
  return readLocal()
    .books.filter((book) => book.owner === owner && book.shelfId === id)
    .sort((a, b) => b.savedAt - a.savedAt);
}

function localViewers(owner: string, shelfId: string): ShelfViewer[] {
  assertCanChange(owner, shelfId);
  return readLocal().shares
    .filter((share) => share.ownerId === owner && share.shelfId === shelfId)
    .map((share) => ({ id: share.viewerId, name: share.viewerName, email: share.viewerEmail }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function localShare(owner: string, shelfId: string, email: string): ShelfViewer {
  const address = shareAddress(email);
  const state = ensureGuest(readLocal());
  const me = state.users.find((user) => user.id === owner);
  if (!me) throw new Error("Sign in to share a shelf.");
  if (address === me.email.toLowerCase()) throw new Error("That shelf is already yours.");
  assertCanChange(owner, shelfId);
  const other = state.users.find((user) => user.email.toLowerCase() === address);
  if (!other) throw new Error("No account uses that email yet. They need to sign in on Armarium before you can share with them.");
  const mine = state.shares.filter((share) => share.ownerId === owner && share.shelfId === shelfId);
  if (mine.length >= 20 && !mine.some((share) => share.viewerId === other.id)) {
    throw new Error("This shelf is already shared with 20 people.");
  }
  state.shares = state.shares.filter((share) => !(share.ownerId === owner && share.shelfId === shelfId && share.viewerId === other.id));
  state.shares.push({ ownerId: owner, shelfId, viewerId: other.id, viewerEmail: address, viewerName: other.name });
  writeLocal(state);
  return { id: other.id, name: other.name, email: address };
}

function localUnshare(owner: string, shelfId: string, viewerId: string) {
  assertCanChange(owner, shelfId);
  const state = ensureGuest(readLocal());
  state.shares = state.shares.filter((share) => !(share.ownerId === owner && share.shelfId === shelfId && share.viewerId === viewerId));
  writeLocal(state);
}

function localSave(owner: string, hit: LibraryHit, shelfId?: string) {
  if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
  const id = chosenLocalShelf(owner, shelfId);
  const state = ensureGuest(readLocal());
  if (state.books.some((book) => book.owner === owner && book.shelfId === id && book.id === hit.id)) return;
  state.books.push({
    id: hit.id,
    owner,
    shelfId: id,
    title: hit.title.slice(0, 300),
    author: (hit.author || "Unknown").slice(0, 200),
    year: hit.year,
    coverId: hit.coverId,
    description: hit.description ?? null,
    pages: hit.pages ?? null,
    publisher: hit.publisher ?? null,
    categories: hit.categories ?? null,
    image: hit.image ?? null,
    savedAt: Date.now(),
  });
  writeLocal(state);
}

function localRemove(owner: string, id: string, shelfId?: string) {
  const shelf = chosenLocalShelf(owner, shelfId);
  const state = ensureGuest(readLocal());
  state.books = state.books.filter((book) => !(book.owner === owner && book.shelfId === shelf && book.id === id));
  writeLocal(state);
}

function takeGuestLibrary(): { shelves: BookShelf[]; books: (ShelfBook & { shelfId: string })[] } {
  const state = ensureGuest(readLocal());
  const owner = state.guestId;
  ensureOwnerShelf(state, owner);
  const shelves = state.shelves.filter((shelf) => shelf.owner === owner).map((shelf) => asOwned(state, shelf));
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
    async saveBook(hit, shelfId) {
      localSave(current().id, hit, shelfId);
    },
    async removeBook(id, shelfId) {
      localRemove(current().id, id, shelfId);
    },
    async books(shelfId, ownerId) {
      return localBooks(current().id, shelfId, ownerId);
    },
    async shareShelf(shelfId, email) {
      return localShare(current().id, shelfId, email);
    },
    async viewers(shelfId) {
      return localViewers(current().id, shelfId);
    },
    async unshareShelf(shelfId, viewerId) {
      localUnshare(current().id, shelfId, viewerId);
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
    saveBook: (hit, shelfId) => active.saveBook(hit, shelfId),
    removeBook: (id, shelfId) => active.removeBook(id, shelfId),
    books: (shelfId, ownerId) => active.books(shelfId, ownerId),
    shareShelf: (shelfId, email) => active.shareShelf(shelfId, email),
    viewers: (shelfId) => active.viewers(shelfId),
    unshareShelf: (shelfId, viewerId) => active.unshareShelf(shelfId, viewerId),
  };
}

export function createBackend(): Backend {
  return firebasePublicConfig() ? createResilientBackend() : createLocalBackend();
}
