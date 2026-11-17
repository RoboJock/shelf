"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookFacts, Cover, ShelfPicker } from "./library";
import { bookHref, loadBookPage, seriesPlace, type BookLink, type BookPageInfo, type RelatedBook } from "../lib/details";

export function BookPage() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const cover = Number(params.get("cover"));
  const [page, setPage] = useState<BookPageInfo | null>(null);
  const [settled, setSettled] = useState(false);
  const [state, setState] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setPage(null);
    setSettled(false);
    setSaving(false);
    setState("");
    loadBookPage(id, controller.signal, fetch, Number.isInteger(cover) && cover > 0 ? cover : null)
      .then((result) => {
        if (controller.signal.aborted) return;
        setPage(result);
        setSettled(true);
        setState(result ? "" : "This book could not be opened.");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setSettled(true);
        setPage(null);
        setState(error instanceof Error ? error.message : "This book could not be opened.");
      });
    return () => controller.abort();
  }, [id, cover]);

  if (!id) return <p className="status">Choose a book from a search or a shelf.</p>;
  if (!settled) return <BookFetch />;
  if (!page) return <p className="status">{state}</p>;
  const { book } = page;

  return (
    <>
    <article className="detail">
      <Cover book={book} />
      <div>
        <h1>{book.title}</h1>
        {book.author ? <p className="byline">{book.author}{book.year ? ` · ${book.year}` : ""}</p> : null}
        <button type="button" className="save-book" onClick={() => setSaving(true)}>Add to a shelf</button>
        {saving ? <ShelfPicker hit={book} onClose={() => setSaving(false)} /> : null}
        {page.series ? <p className="series-place">{seriesPlace(page.series.name, page.series.position)}</p> : settled ? <p className="series-place">This book is not part of a series.</p> : null}
        {page.series?.summary ? <p className="summary">{page.series.summary}</p> : null}
        {page.series ? <LinkList links={page.series.links} /> : null}
        {page.summary ? <p className="summary">{page.summary}</p> : null}
        <BookFacts book={{ ...book, description: null }} />
        <LinkGroup title="Where to buy" links={page.purchase} />
        <LinkGroup title={book.author} links={page.authorLinks} />
        <LinkGroup title="More about this book" links={page.reading} />
      </div>
    </article>
    {page.series && page.series.books.length > 0 ? (
      <section className="related">
        <h2>Other books in {page.series.name}</h2>
        <RelatedBooks books={page.series.books} />
      </section>
    ) : null}
    {page.authorBooks.length > 0 ? (
      <section className="related" aria-label={`More by ${book.author}`}>
        <h2>More by {book.author}</h2>
        <RelatedBooks books={page.authorBooks} />
      </section>
    ) : null}
    {page.suggestions.length > 0 ? (
      <section className="related">
        <h2>More {page.genre}</h2>
        <RelatedBooks books={page.suggestions} />
      </section>
    ) : null}
  </>
  );
}

export function BookFetch() {
  return (
    <div className="book-fetch" role="status">
      <div className="folio" aria-hidden="true">
        <div className="folio-board" />
        <div className="folio-spread">
          <div className="folio-sheet left prose-settled" />
          <div className="folio-sheet right prose-c" />
        </div>
        <div className="folio-turn one">
          <span className="folio-face front prose-a" />
          <span className="folio-face back prose-settled" />
        </div>
        <div className="folio-turn two">
          <span className="folio-face front prose-b" />
          <span className="folio-face back prose-settled" />
        </div>
        <div className="folio-turn three">
          <span className="folio-face front prose-c" />
          <span className="folio-face back prose-settled" />
        </div>
        <div className="folio-gutter" />
      </div>
      <p>fetching book information</p>
    </div>
  );
}

function RelatedBooks({ books }: { books: RelatedBook[] }) {
  return (
    <div className="related-row">
      {books.map((item) => (
        <article key={item.id} className="book">
          <Link href={bookHref(item.id, item.coverId)} className="book-link" aria-label={item.title}>
            <Cover book={{ title: item.title, coverId: item.coverId }} />
          </Link>
          {item.position ? <p className="part">{/^\d+$/.test(item.position) ? `Book ${item.position}` : item.position}</p> : null}
          <h3><Link href={bookHref(item.id, item.coverId)}>{item.title}</Link></h3>
          <p>{item.author}{item.year ? ` · ${item.year}` : ""}</p>
        </article>
      ))}
    </div>
  );
}

function LinkList({ links }: { links: BookLink[] }) {
  if (!links.length) return null;
  return (
    <ul className="detail-links">
      {links.map((link) => (
        <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
      ))}
    </ul>
  );
}

function LinkGroup({ title, links }: { title: string; links: BookLink[] }) {
  if (!links.length) return null;
  return (
    <section>
      {title ? <h2>{title}</h2> : null}
      <ul className="detail-links">
        {links.map((link) => (
          <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a></li>
        ))}
      </ul>
    </section>
  );
}
