"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coverUrl, shelfOrders, sortShelf, type LibraryHit, type ShelfBook, type ShelfOrder } from "../lib/books";
import { findBooks } from "../lib/search";
import { createBackend, firebasePublicConfig, type AppUser, type Backend } from "../lib/backend";

export function ShelfApp() {
  const backend = useMemo<Backend>(() => createBackend(), []);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [user, setUser] = useState<AppUser | null>(null);
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [hitsClose, setHitsClose] = useState(false);
  const [preview, setPreview] = useState<LibraryHit[] | null>(null);
  const [previewClose, setPreviewClose] = useState(false);
  const [submitted, setSubmitted] = useState("");
  const [searching, setSearching] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState<ShelfOrder>("newest");
  const [orderOpen, setOrderOpen] = useState(false);
  const orderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => backend.subscribe(setUser), [backend]);

  useEffect(() => {
    if (!orderOpen) return;
    function close(event: PointerEvent) {
      if (!orderRef.current?.contains(event.target as Node)) setOrderOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOrderOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [orderOpen]);

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

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 2 || typed === submitted) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findBooks(typed, 6, controller.signal).then((result) => {
        setPreview(result.hits);
        setPreviewClose(result.close);
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setPreview([]);
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, submitted]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setStatus("");
    setSubmitted(q);
    try {
      const result = await findBooks(q, 12);
      setHits(result.hits);
      setHitsClose(result.close);
      if (result.hits.length === 0) setStatus("No books matched that search.");
    } catch (error) {
      setHits([]);
      setHitsClose(false);
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
  const shelf = useMemo(() => sortShelf(books, order), [books, order]);
  const orderLabel = shelfOrders.find((item) => item.id === order)?.label ?? "Newest first";
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
            {user?.name ?? "Guest"}
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

      <div className="desk">
      <h1>What are you reading?</h1>
      <p className="lede">Search for a book, then add it to your shelf.</p>
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
          aria-label="Search for a book"
        />
        <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
      </form>
      {status ? <p className="status" role="status">{status}</p> : null}

      {preview && preview.length > 0 ? (
        <HitSection
          title={previewClose ? "Close matches" : "Preview"}
          hits={preview}
          saved={saved}
          onSave={save}
        />
      ) : null}

      {hits ? (
        <HitSection
          title={hitsClose ? "Close matches" : "Open Library"}
          hits={hits}
          saved={saved}
          onSave={save}
          empty="Try another title or author."
        />
      ) : null}

      <section>
        <div className="section">
          <h2>On your shelf</h2>
          <div className="sort" ref={orderRef}>
            <button
              type="button"
              className="sort-button"
              aria-expanded={orderOpen}
              aria-haspopup="menu"
              onClick={() => setOrderOpen((open) => !open)}
            >
              <span>{orderLabel}</span>
              <Chevron open={orderOpen} />
            </button>
            {orderOpen ? (
              <ul className="sort-menu" role="menu">
                {shelfOrders.map((item) => (
                  <li key={item.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === order}
                      onClick={() => {
                        setOrder(item.id);
                        setOrderOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        {books.length === 0 ? (
          <>
            <div className="books" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="book-slot" key={index}>
                  <div className="cover-slot" />
                </div>
              ))}
            </div>
            <p className="empty">Nothing saved yet. Search a book to add to your shelf.</p>
          </>
        ) : (
          <div className="books">
            {shelf.map((book) => (
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
      </div>
    </main>
  );
}

function HitSection({
  title,
  hits,
  saved,
  onSave,
  empty,
}: {
  title: string;
  hits: LibraryHit[];
  saved: Set<string>;
  onSave: (hit: LibraryHit) => void;
  empty?: string;
}) {
  return (
    <section>
      <div className="section">
        <h2>{title}</h2>
        <span>{hits.length} {hits.length === 1 ? "result" : "results"}</span>
      </div>
      {hits.length === 0 && empty ? <p className="empty">{empty}</p> : (
        <div className="books">
          {hits.map((hit) => (
            <article key={hit.id} className="book hit">
              <Cover book={hit} />
              <h3>{hit.title}</h3>
              <p>{hit.author}{hit.year ? ` · ${hit.year}` : ""}</p>
              {saved.has(hit.id) ? (
                <p>On your shelf</p>
              ) : (
                <button type="button" onClick={() => void onSave(hit)}>Save</button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "sort-chevron open" : "sort-chevron"} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 6.1 8 10.9l4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
