import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  linkWithCredential,
  onAuthStateChanged,
  signInAnonymously,
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
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { bookDocId, readBook, type LibraryHit, type ShelfBook } from "./books";

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

export function createFirebaseBackend(): Backend {
  return {
    mode: "firebase",
    subscribe(listener) {
      const { auth: current } = services();
      let stop = false;
      const unsub = onAuthStateChanged(current, (user) => {
        if (stop) return;
        if (user) {
          listener(asUser(user));
          return;
        }
        signInAnonymously(current).catch((error: unknown) => {
          console.error(friendly(error).message);
          listener(null);
        });
      });
      return () => {
        stop = true;
        unsub();
      };
    },
    async register(email, password, name) {
      try {
        const { auth: current } = services();
        const display = cleanName(name);
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        const user = current.currentUser;
        if (user?.isAnonymous) {
          const credential = EmailAuthProvider.credential(email.trim(), password);
          const linked = await linkWithCredential(user, credential);
          await updateProfile(linked.user, { displayName: display });
          await remember(linked.user, display);
          return;
        }
        const created = await createUserWithEmailAndPassword(current, email.trim(), password);
        await updateProfile(created.user, { displayName: display });
        await remember(created.user, display);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signIn(email, password) {
      try {
        const { auth: current } = services();
        const signed = await signInWithEmailAndPassword(current, email.trim(), password);
        if (signed.user.displayName) await remember(signed.user, signed.user.displayName);
      } catch (error) {
        throw friendly(error);
      }
    },
    async signOut() {
      try {
        const { auth: current } = services();
        await signOut(current);
        await signInAnonymously(current);
      } catch (error) {
        throw friendly(error);
      }
    },
    async saveBook(hit) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) throw new Error("The guest session is not ready yet.");
      if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
      const name = user.displayName?.trim() || (user.isAnonymous ? "Guest" : "Reader");
      await setDoc(doc(database, "users", user.uid), { name, guest: user.isAnonymous, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(doc(database, "users", user.uid, "books", bookDocId(hit.id)), bookPayload(user, hit, Date.now()));
    },
    async removeBook(id) {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) throw new Error("The guest session is not ready yet.");
      await deleteDoc(doc(database, "users", user.uid, "books", bookDocId(id)));
    },
    async books() {
      const { auth: current, db: database } = services();
      const user = current.currentUser;
      if (!user) return [];
      const snap = await getDocs(query(collection(database, "users", user.uid, "books"), orderBy("savedAt", "desc")));
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

interface LocalState {
  users: LocalUser[];
  session: string | null;
  guestId: string;
  books: (ShelfBook & { owner: string })[];
}

function blankLocal(): LocalState {
  return { users: [], session: null, guestId: "", books: [] };
}

function readLocal(): LocalState {
  if (typeof window === "undefined") return blankLocal();
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "") as LocalState;
    if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.books)) return blankLocal();
    return {
      users: parsed.users,
      session: typeof parsed.session === "string" ? parsed.session : null,
      guestId: typeof parsed.guestId === "string" ? parsed.guestId : "",
      books: parsed.books,
    };
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
      if (me.guest) {
        state.books.forEach((book) => {
          if (book.owner === me.id) book.owner = id;
        });
      }
      state.session = id;
      writeLocal(state);
      emit();
    },
    async signIn(email, password) {
      const state = ensureGuest(readLocal());
      const account = state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
      if (!account || (await digest(account.salt, password)) !== account.hash) {
        throw new Error("Email or password did not match.");
      }
      state.session = account.id;
      writeLocal(state);
      emit();
    },
    async signOut() {
      const state = ensureGuest(readLocal());
      state.session = null;
      writeLocal(state);
      emit();
    },
    async saveBook(hit) {
      if (!hit.id.startsWith("/works/") || !hit.title.trim()) throw new Error("That book could not be saved.");
      const state = ensureGuest(readLocal());
      const owner = current().id;
      const existing = state.books.find((book) => book.owner === owner && book.id === hit.id);
      if (existing) return;
      state.books.push({
        id: hit.id,
        owner,
        title: hit.title.slice(0, 300),
        author: (hit.author || "Unknown").slice(0, 200),
        year: hit.year,
        coverId: hit.coverId,
        savedAt: Date.now(),
      });
      writeLocal(state);
    },
    async removeBook(id) {
      const state = ensureGuest(readLocal());
      const owner = current().id;
      state.books = state.books.filter((book) => !(book.owner === owner && book.id === id));
      writeLocal(state);
    },
    async books() {
      const owner = current().id;
      return readLocal()
        .books.filter((book) => book.owner === owner)
        .sort((a, b) => b.savedAt - a.savedAt);
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
    saveBook: (hit) => active.saveBook(hit),
    removeBook: (id) => active.removeBook(id),
    books: () => active.books(),
  };
}

export function createBackend(): Backend {
  return firebasePublicConfig() ? createResilientBackend() : createLocalBackend();
}
