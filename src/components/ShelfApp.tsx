"use client";

import { useEffect, useMemo, useState } from "react";
import { coverUrl, readSearch, type LibraryHit, type ShelfBook } from "../lib/books";
import { createBackend, firebasePublicConfig, type AppUser, type Backend } from "../lib/backend";

export function ShelfApp() {
  const backend = useMemo<Backend>(() => createBackend(), []);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [user, setUser] = useState<AppUser | null>(null);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => backend.subscribe(setUser), [backend]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    backend.books().then((next) => {
      if (!cancel) setBooks(next);
    }).catch((error: unknown) => {
      if (!cancel) setStatus(error instanceof Error ? error.message : "Could not load the shelf.");
    });
    return () => {
      cancel = true;
    };
  }, [backend, user]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setStatus("");
    try {
      const response = await fetch(`https://openlibrary.org/search.json?${new URLSearchParams({
        q,
        limit: "12",
        fields: "key,title,author_name,cover_i,first_publish_year",
      })}`);
      if (!response.ok) throw new Error("Open Library did not answer. Try the search again.");
      const hitsNext = readSearch(await response.json());
      setHits(hitsNext);
      if (hitsNext.length === 0) setStatus("No books matched that search.");
    } catch (error) {
      setHits([]);
      setStatus(error instanceof Error ? error.message : "Open Library did not answer.");
    } finally {
      setSearching(false);
    }
  }

  async function save(hit: LibraryHit) {
    setStatus("");
    try {
      await backend.saveBook(hit);
      setBooks(await backend.books());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that book.");
    }
  }

  async function remove(id: string) {
    setStatus("");
    try {
      await backend.removeBook(id);
      setBooks(await backend.books());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove that book.");
    }
  }

  const saved = new Set(books.map((book) => book.id));
  const config = firebasePublicConfig();

  return (
    <main className="page">
      <nav>
        <div className="mark">Shelf</div>
        <div className="nav-right">
          <div className="count">{books.length === 0 ? "No books saved" : `${books.length} ${books.length === 1 ? "book" : "books"} saved`}</div>
          <button
            type="button"
            className="theme-toggle"
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              document.documentElement.dataset.theme = next;
              localStorage.setItem("shelf-theme", next);
            }}
          >
            {theme === "dark" ? <MoonIcon /> : <SunIcon />}
          </button>
          <button type="button" className="who" onClick={() => setAccountOpen((open) => !open)}>
            <span>{user?.name ?? "Guest"}</span>
            <small>{user?.guest !== false ? "In this browser" : user.email || "Account"}</small>
          </button>
        </div>
      </nav>

      {accountOpen ? (
        <AccountPanel
          backend={backend}
          user={user}
          onClose={() => setAccountOpen(false)}
          onChange={() => {
            void backend.books().then(setBooks).catch(() => undefined);
          }}
        />
      ) : null}

      <h1>What are you reading?</h1>
      <p className="lede">Search Open Library, then keep the cover, author, and year on your shelf.</p>
      {backend.mode === "local" ? (
        <p className="banner">
          {config
            ? `Firebase project ${config.projectId} is connected, but sign-in is still off, so this shelf stays in the browser.`
            : "Firebase is not connected, so this shelf stays in the browser until its data is cleared."}
        </p>
      ) : null}
      <form className="search" onSubmit={(event) => void search(event)}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title or author"
          aria-label="Search Open Library"
        />
        <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
      </form>
      {status ? <p className="status" role="status">{status}</p> : null}

      {hits ? (
        <section>
          <div className="section">
            <h2>Open Library</h2>
            <span>{hits.length} {hits.length === 1 ? "result" : "results"}</span>
          </div>
          {hits.length === 0 ? <p className="empty">Try another title or author.</p> : (
            <div className="books">
              {hits.map((hit) => (
                <article key={hit.id} className="book hit">
                  <Cover book={hit} />
                  <h3>{hit.title}</h3>
                  <p>{hit.author}{hit.year ? ` · ${hit.year}` : ""}</p>
                  {saved.has(hit.id) ? (
                    <p>On your shelf</p>
                  ) : (
                    <button type="button" onClick={() => void save(hit)}>Save</button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <div className="section">
          <h2>On your shelf</h2>
          <span>Newest first</span>
        </div>
        {books.length === 0 ? (
          <p className="empty">Nothing saved yet. Search Open Library and keep a book.</p>
        ) : (
          <div className="books">
            {books.map((book) => (
              <article key={book.id} className="book">
                <Cover book={book} />
                <h3>{book.title}</h3>
                <p>{book.author}</p>
                <button type="button" className="quiet" onClick={() => void remove(book.id)}>Remove</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Cover({ book }: { book: { title: string; coverId: number | null } }) {
  const src = coverUrl(book.coverId);
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="cover-fallback">{book.title}</div>;
  return <img className="cover" src={src} alt="" onError={() => setFailed(true)} />;
}

function AccountPanel({
  backend,
  user,
  onClose,
  onChange,
}: {
  backend: Backend;
  user: AppUser | null;
  onClose: () => void;
  onChange: () => void;
}) {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      if (mode === "create") await backend.register(email, password, name);
      else await backend.signIn(email, password);
      setPassword("");
      setMessage(mode === "create" ? "Account saved. This shelf is on the account now." : "Signed in.");
      onChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    }
  }

  return (
    <section className="account">
      <h2>{user?.guest !== false ? "Guest" : user?.name}</h2>
      <p>
        {user?.guest !== false
          ? "Books stay in this browser until its data is cleared. An account keeps the same shelf."
          : "This shelf is saved on the account."}
      </p>
      {user && !user.guest ? (
        <button
          type="button"
          className="sign-out"
          onClick={() => {
            void backend.signOut().then(() => {
              setMessage("Signed out. You are a guest again.");
              onChange();
              onClose();
            }).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : "Could not sign out.");
            });
          }}
        >
          Sign out
        </button>
      ) : (
        <>
          <form onSubmit={(event) => void submit(event)}>
            <div className="row">
              <button type="button" className={mode === "create" ? "on" : ""} onClick={() => setMode("create")}>Create account</button>
              <button type="button" className={mode === "signin" ? "on" : ""} onClick={() => setMode("signin")}>Sign in</button>
            </div>
            {mode === "create" ? (
              <label>
                Display name
                <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={24} />
              </label>
            ) : null}
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "create" ? "new-password" : "current-password"} />
            </label>
            <button type="submit">{mode === "create" ? "Create account" : "Sign in"}</button>
          </form>
        </>
      )}
      {message ? <p className="status" role="status">{message}</p> : null}
    </section>
  );
}

function SunIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14.5 3.2a8.2 8.2 0 1 0 6.3 13.2A7.2 7.2 0 0 1 14.5 3.2z" />
    </svg>
  );
}
