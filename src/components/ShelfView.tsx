"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { shelfOrders, sortShelf, type ShelfBook, type ShelfOrder } from "../lib/books";
import { enrichBooks } from "../lib/google-books";
import { useShelf } from "./AppShell";
import { BookFacts, Chevron, Cover } from "./library";
import { bookHref } from "../lib/details";

export function ShelfView() {
  const { backend, shelves, shelvesReady, refreshShelves } = useShelf();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const shelf = shelves.find((item) => item.id === id) ?? null;
  const [books, setBooks] = useState<ShelfBook[]>([]);
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
    backend.books(id).then((next) => {
      if (cancel) return;
      setBooks(next);
      void enrichBooks(next).then((richer) => {
        if (!cancel) setBooks(richer);
      });
    }).catch((error: unknown) => {
      if (!cancel) setStatus(error instanceof Error ? error.message : "Could not load this shelf.");
    });
    return () => {
      cancel = true;
    };
  }, [backend, id, shelves]);

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
        {editing ? (
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
            {shelves.length > 1 ? (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setStatus("");
                  void backend.deleteShelf(shelf.id).then(() => {
                    refreshShelves();
                    const next = shelves.find((item) => item.id !== shelf.id);
                    router.push(next ? `/shelf?id=${encodeURIComponent(next.id)}` : "/");
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
            <button type="button" className="shelf-edit" onClick={() => { setDraft(shelf.name); setEditing(true); }}>Edit</button>
          </div>
        )}
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
          <div className="books" aria-hidden="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="book-slot" key={index}>
                <div className="cover-slot" />
              </div>
            ))}
          </div>
          <p className="empty">Nothing saved on this shelf yet. Search a book to add it.</p>
        </>
      ) : (
        <div className="books">
          {ordered.map((book) => (
            <article key={book.id} className="book">
              <Link href={bookHref(book.id, book.coverId)} className="book-link" aria-label={book.title}><Cover book={book} /></Link>
              <h3><Link href={bookHref(book.id, book.coverId)}>{book.title}</Link></h3>
              <p>{book.author}{book.year ? ` · ${book.year}` : ""}</p>
              <BookFacts book={book} />
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setStatus("");
                  void backend.removeBook(book.id, shelf.id).then(() => backend.books(shelf.id)).then(setBooks).catch((error: unknown) => {
                    setStatus(error instanceof Error ? error.message : "Could not remove that book.");
                  });
                }}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function ShelfIndex() {
  const { backend, shelves, shelvesReady, refreshShelves } = useShelf();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");

  if (!shelvesReady) return <p className="status">Loading the shelves…</p>;

  return (
    <>
      <h1>Shelves</h1>
      {shelves.length === 0 ? <p className="lede">You have not made a shelf yet.</p> : (
        <ul className="shelf-index">
          {shelves.map((shelf) => (
            <li key={shelf.id}>
              <Link href={`/shelf?id=${encodeURIComponent(shelf.id)}`}>{shelf.name}</Link>
            </li>
          ))}
        </ul>
      )}
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
                router.push(`/shelf?id=${encodeURIComponent(shelf.id)}`);
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
