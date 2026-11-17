"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { shelfOrders, sortShelf, type ShelfBook, type ShelfOrder } from "../lib/books";
import { shelfHref, type BookShelf, type ShelfViewer } from "../lib/backend";
import { enrichBooks } from "../lib/google-books";
import { useShelf } from "./AppShell";
import { BookFacts, Chevron, Cover } from "./library";
import { bookHref } from "../lib/details";

export function ShelfView() {
  const { backend, user, shelves, shelvesReady, refreshShelves } = useShelf();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const owner = params.get("owner") ?? "";
  const shelf = shelves.find((item) => item.id === id && (owner ? item.ownerId === owner : item.access !== "viewer")) ?? null;
  const owned = shelves.filter((item) => item.access !== "viewer");
  const canEdit = shelf?.access !== "viewer";
  const [books, setBooks] = useState<ShelfBook[]>([]);
  const [booksReady, setBooksReady] = useState(false);
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState<ShelfOrder>("newest");
  const [orderOpen, setOrderOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const orderRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => sortShelf(books, order), [books, order]);
  const orderLabel = shelfOrders.find((item) => item.id === order)?.label ?? "Newest first";

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    setBooksReady(false);
    setStatus("");
    backend.books(id, owner || undefined).then((next) => {
      if (cancel) return;
      setBooks(next);
      setBooksReady(true);
      void enrichBooks(next).then((richer) => {
        if (!cancel) setBooks(richer);
      });
    }).catch((error: unknown) => {
      if (!cancel) setStatus(error instanceof Error ? error.message : "Could not load this shelf.");
    });
    return () => {
      cancel = true;
    };
  }, [backend, id, owner]);

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

  if (!id) return <ShelfIndex />;
  if (!shelvesReady) return <p className="status">Loading the shelf…</p>;
  if (!shelf) return <p className="status">That shelf is not here.</p>;

  return (
    <>
      <div className="section shelf-page">
        {canEdit && editing ? (
          <form
            className="shelf-entry on"
            onSubmit={(event) => {
              event.preventDefault();
              setStatus("");
              void backend.renameShelf(shelf.id, draft).then(() => {
                setEditing(false);
                refreshShelves();
              }).catch((error: unknown) => {
                setStatus(error instanceof Error ? error.message : "Could not save that shelf name.");
              });
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Shelf name"
              maxLength={40}
              required
              autoFocus
            />
            <button type="submit">Save</button>
            {owned.length > 1 ? (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setStatus("");
                  void backend.deleteShelf(shelf.id).then(() => {
                    refreshShelves();
                    const next = owned.find((item) => item.id !== shelf.id);
                    router.push(next ? shelfHref(next) : "/");
                  }).catch((error: unknown) => {
                    setStatus(error instanceof Error ? error.message : "Could not delete that shelf.");
                  });
                }}
              >
                Delete
              </button>
            ) : null}
            <button type="button" className="quiet" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <div className="shelf-entry on">
            <h2>{shelf.name}</h2>
            {canEdit ? <button type="button" className="shelf-edit" onClick={() => { setDraft(shelf.name); setEditing(true); }}>Edit</button> : null}
          </div>
        )}
        {canEdit ? null : <p className="share-note">Shared by {shelf.ownerName}. You can look through this shelf.</p>}
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
      {status ? <p className="status" role="status">{status}</p> : null}
      {books.length === 0 ? (
        <>
          {booksReady ? (
            <div className="books">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="book-slot" key={index}>
                  <Link href="/search" className="cover-slot empty-book" aria-label="Find a book">
                    <svg className="empty-plus" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="books" aria-hidden="true">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="book-slot" key={index}>
                  <div className="cover-slot" />
                </div>
              ))}
            </div>
          )}
          <p className="empty">{canEdit ? "Nothing saved on this shelf yet. Search a book to add it." : "Nothing saved on this shelf yet."}</p>
        </>
      ) : (
        <div className="books">
          {ordered.map((book) => (
            <article key={book.id} className="book">
              <Link href={bookHref(book.id, book.coverId)} className="book-link" aria-label={book.title}><Cover book={book} /></Link>
              <h3><Link href={bookHref(book.id, book.coverId)}>{book.title}</Link></h3>
              <p>{book.author}{book.year ? ` · ${book.year}` : ""}</p>
              <BookFacts book={book} />
              {canEdit ? (
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setStatus("");
                    void backend.removeBook(book.id, shelf.id).then(() => backend.books(shelf.id, shelf.ownerId)).then(setBooks).catch((error: unknown) => {
                      setStatus(error instanceof Error ? error.message : "Could not remove that book.");
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
      <SharePanel shelf={shelf} signedIn={Boolean(user && !user.guest)} />
    </>
  );
}

function SharePanel({ shelf, signedIn }: { shelf: BookShelf; signedIn: boolean }) {
  const { backend, refreshShelves } = useShelf();
  const [viewers, setViewers] = useState<ShelfViewer[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const viewing = shelf.access === "viewer";

  useEffect(() => {
    if (viewing || !signedIn) return;
    let cancel = false;
    backend.viewers(shelf.id).then((next) => {
      if (!cancel) setViewers(next);
    }).catch(() => {
      if (!cancel) setViewers([]);
    });
    return () => {
      cancel = true;
    };
  }, [backend, shelf.id, signedIn, viewing]);

  if (viewing) return null;
  if (!signedIn) {
    return <p className="share-note">Sign in to share this shelf. People you invite can look through it, and only you can change it.</p>;
  }

  return (
    <section className="share-panel" aria-label="Share this shelf">
      <h3>Share this shelf</h3>
      <p className="share-note">They can look through it. Only you can change it.</p>
      <form
        className="shelf-entry"
        onSubmit={(event) => {
          event.preventDefault();
          setStatus("");
          void backend.shareShelf(shelf.id, email).then((viewer) => {
            setEmail("");
            setViewers((current) => current.some((item) => item.id === viewer.id) ? current : [...current, viewer].sort((a, b) => a.name.localeCompare(b.name)));
            refreshShelves();
          }).catch((error: unknown) => {
            setStatus(error instanceof Error ? error.message : "Could not share that shelf.");
          });
        }}
      >
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Email to share with"
          placeholder="Email"
          type="email"
          maxLength={120}
          required
        />
        <button type="submit">Share</button>
      </form>
      {viewers.length > 0 ? (
        <ul className="share-list">
          {viewers.map((viewer) => (
            <li key={viewer.id}>
              <span>{viewer.name}<span className="share-email">{viewer.email}</span></span>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setStatus("");
                  void backend.unshareShelf(shelf.id, viewer.id).then(() => {
                    setViewers((current) => current.filter((item) => item.id !== viewer.id));
                    refreshShelves();
                  }).catch((error: unknown) => {
                    setStatus(error instanceof Error ? error.message : "Could not stop sharing.");
                  });
                }}
              >
                Stop sharing
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {status ? <p className="status" role="status">{status}</p> : null}
    </section>
  );
}

function ShelfIndex() {
  const { backend, shelves, shelvesReady, refreshShelves } = useShelf();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const owned = shelves.filter((shelf) => shelf.access !== "viewer");
  const shared = shelves.filter((shelf) => shelf.access === "viewer");

  if (!shelvesReady) return <p className="status">Loading the shelves…</p>;

  return (
    <>
      <h1>Shelves</h1>
      {owned.length === 0 ? <p className="lede">You have not made a shelf yet.</p> : (
        <ul className="shelf-index">
          {owned.map((shelf) => (
            <li key={`${shelf.ownerId}-${shelf.id}`}>
              <Link href={shelfHref(shelf)}>{shelf.name}</Link>
            </li>
          ))}
        </ul>
      )}
      {shared.length > 0 ? (
        <>
          <h2 className="shelf-group">Shared with you</h2>
          <ul className="shelf-index">
            {shared.map((shelf) => (
              <li key={`${shelf.ownerId}-${shelf.id}`}>
                <Link href={shelfHref(shelf)}>
                  {shelf.name}
                  <span className="shelf-by">From {shelf.ownerName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="shelf-index-add">
        {creating ? (
          <form
            className="shelf-entry"
            onSubmit={(event) => {
              event.preventDefault();
              setStatus("");
              void backend.createShelf(draft).then((shelf) => {
                setCreating(false);
                setDraft("");
                refreshShelves();
                router.push(shelfHref(shelf));
              }).catch((error: unknown) => {
                setStatus(error instanceof Error ? error.message : "Could not create that shelf.");
              });
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="New shelf name"
              placeholder="Name"
              maxLength={40}
              required
              autoFocus
            />
            <button type="submit">Add</button>
            <button type="button" className="quiet" onClick={() => setCreating(false)}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="shelf-add" onClick={() => { setCreating(true); setDraft(""); }}>New shelf</button>
        )}
      </div>
      {status ? <p className="status">{status}</p> : null}
    </>
  );
}
