"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { shelfOrders, sortShelf, type ShelfOrder } from "../lib/books";
import { bookHref } from "../lib/details";
import { publicHref, publicShelf, publicShelves } from "../lib/public-shelves";
import { Chevron, Cover } from "./library";

export function PublicShelves() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  if (!id) return <PublicIndex />;
  const shelf = publicShelf(id);
  if (!shelf) return <p className="status">That shelf is not here.</p>;
  return <PublicShelf shelfId={shelf.id} />;
}

function PublicIndex() {
  return (
    <>
      <h1>Public Shelves</h1>
      <p className="lede">Shelves anyone can open.</p>
      <ul className="shelf-index">
        {publicShelves.map((shelf) => (
          <li key={shelf.id}>
            <Link href={publicHref(shelf.id)}>{shelf.name}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function PublicShelf({ shelfId }: { shelfId: string }) {
  const shelf = publicShelf(shelfId);
  const [order, setOrder] = useState<ShelfOrder>("newest");
  const [orderOpen, setOrderOpen] = useState(false);
  const orderRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => (shelf ? sortShelf(shelf.books, order) : []), [shelf, order]);
  const orderLabel = shelfOrders.find((item) => item.id === order)?.label ?? "Newest first";

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

  if (!shelf) return <p className="status">That shelf is not here.</p>;

  return (
    <>
      <div className="section shelf-page">
        <div className="shelf-entry on">
          <h2>{shelf.name}</h2>
        </div>
        <p className="share-note">{shelf.note}</p>
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
      <div className="books">
        {ordered.map((book) => (
          <article key={book.id} className="book">
            <Link href={bookHref(book.id, book.coverId)} className="book-link" aria-label={book.title}><Cover book={book} /></Link>
            <h3><Link href={bookHref(book.id, book.coverId)}>{book.title}</Link></h3>
            <p>{book.author}{book.year ? ` · ${book.year}` : ""}</p>
          </article>
        ))}
      </div>
    </>
  );
}
