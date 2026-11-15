"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { shelfOrders, sortShelf, type ShelfBook, type ShelfOrder } from "../lib/books";
import { useShelf } from "./AppShell";
import { Chevron, Cover } from "./library";

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
      if (!cancel) setBooks(next);
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

  if (!id) return <p className="status">Choose a shelf.</p>;
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
              <Cover book={book} />
              <h3>{book.title}</h3>
              <p>{book.author}</p>
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
