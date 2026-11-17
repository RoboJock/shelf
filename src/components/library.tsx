"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { coverUrl, resultOrders, sortResults, type BookDetails, type LibraryHit, type ResultOrder } from "../lib/books";
import type { BookShelf } from "../lib/backend";
import { enrichBooks } from "../lib/google-books";
import { useShelf } from "./AppShell";
import { bookHref } from "../lib/details";
import { PlaceBook } from "./PlaceBook";

export function Cover({ book }: { book: { title: string; coverId: number | null; image?: string | null } }) {
  const primary = coverUrl(book.coverId);
  const backup = coverUrl(null, book.image);
  const preferred = primary || backup;
  const [src, setSrc] = useState(preferred);
  useEffect(() => {
    setSrc(preferred);
  }, [preferred]);
  if (!src) return <div className="cover-fallback">{book.title}</div>;
  return <img className="cover" src={src} alt="" onError={() => setSrc(src === primary ? backup : null)} />;
}

export function BookFacts({ book }: { book: BookDetails }) {
  const meta = [book.pages ? `${book.pages} pages` : "", book.publisher ?? "", book.categories ?? ""].filter(Boolean);
  if (!book.description && meta.length === 0) return null;
  return (
    <>
      {book.description ? <p className="blurb">{book.description}</p> : null}
      {meta.length > 0 ? <p className="meta">{meta.join(" · ")}</p> : null}
    </>
  );
}

export function HitSection({
  title,
  hits,
  note,
  empty,
  order = "relevance",
  onOrder,
}: {
  title: string;
  hits: LibraryHit[];
  note?: string;
  empty?: string;
  order?: ResultOrder;
  onOrder?: (order: ResultOrder) => void;
}) {
  const [picking, setPicking] = useState<LibraryHit | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const orderRef = useRef<HTMLDivElement>(null);
  const shown = sortResults(hits, order);
  const orderLabel = resultOrders.find((item) => item.id === order)?.label ?? "Relevance";

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

  return (
    <section>
      <div className="section">
        <h2>{title}</h2>
        <span>{hits.length} {hits.length === 1 ? "result" : "results"}</span>
        {onOrder ? (
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
                {resultOrders.map((item) => (
                  <li key={item.id} role="none">
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.id === order}
                      onClick={() => {
                        onOrder(item.id);
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
        ) : null}
      </div>
      {note ? <p className="status">{note}</p> : null}
      {shown.length === 0 && empty ? <p className="empty">{empty}</p> : (
        <div className="books">
          {shown.map((hit) => (
            <article key={hit.id} className="book hit">
              <Link href={bookHref(hit.id, hit.coverId)} className="book-link" aria-label={hit.title}><Cover book={hit} /></Link>
              <h3><Link href={bookHref(hit.id, hit.coverId)}>{hit.title}</Link></h3>
              <p>{hit.author}{hit.year ? ` · ${hit.year}` : ""}</p>
              <BookFacts book={hit} />
              <button type="button" onClick={() => setPicking(hit)}>Save</button>
            </article>
          ))}
        </div>
      )}
      {picking ? <ShelfPicker hit={picking} onClose={() => setPicking(null)} /> : null}
    </section>
  );
}

function ShelfPicker({ hit, onClose }: { hit: LibraryHit; onClose: () => void }) {
  const { backend, shelves, refreshShelves } = useShelf();
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [placing, setPlacing] = useState(false);

  async function saveTo(shelf: BookShelf) {
    setStatus("");
    try {
      const [full] = await enrichBooks([hit]);
      await backend.saveBook(full ?? hit, shelf.id);
      refreshShelves();
      setPlacing(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save that book.");
    }
  }

  if (placing) return <PlaceBook onDone={onClose} />;

  return (
    <div className="picker-back" onClick={onClose}>
      <div className="picker" role="dialog" aria-label="Choose a shelf" onClick={(event) => event.stopPropagation()}>
        <h2>Save to a shelf</h2>
        <p>{hit.title}</p>
        <div className="choices">
          {shelves.map((shelf) => (
            <button key={shelf.id} type="button" onClick={() => void saveTo(shelf)}>{shelf.name}</button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStatus("");
            void backend.createShelf(draft).then(async (shelf) => {
              const [full] = await enrichBooks([hit]);
              await backend.saveBook(full ?? hit, shelf.id);
              setDraft("");
              refreshShelves();
              setPlacing(true);
            }).catch((error: unknown) => {
              setStatus(error instanceof Error ? error.message : "Could not create that shelf.");
            });
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="New shelf name"
            placeholder="New shelf"
            maxLength={40}
            required
          />
          <button type="submit">Create</button>
        </form>
        {status ? <p className="status">{status}</p> : null}
        <button type="button" className="quiet" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "sort-chevron open" : "sort-chevron"} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 6.1 8 10.9l4.8-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
