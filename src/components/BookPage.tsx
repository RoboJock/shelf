"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookFacts, Cover } from "./library";
import { bookHref, loadBookPage, seriesPlace, type BookLink, type BookPageInfo, type RelatedBook } from "../lib/details";

export function BookPage() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const cover = Number(params.get("cover"));
  const [page, setPage] = useState<BookPageInfo | null>(null);
  const [state, setState] = useState("Opening the book…");

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setPage(null);
    setState("Opening the book…");
    loadBookPage(id, controller.signal, fetch, Number.isInteger(cover) && cover > 0 ? cover : null)
      .then((result) => {
        setPage(result);
        setState(result ? "" : "This book could not be opened.");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState(error instanceof Error ? error.message : "This book could not be opened.");
      });
    return () => controller.abort();
  }, [id, cover]);

  if (!id) return <p className="status">Choose a book from a search or a shelf.</p>;
  if (!page) return <p className="status">{state}</p>;
  const { book } = page;

  return (
    <>
    <article className="detail">
      <Cover book={book} />
      <div>
        <h1>{book.title}</h1>
        <p className="byline">{book.author}{book.year ? ` · ${book.year}` : ""}</p>
        <p className="series-place">{page.series ? seriesPlace(page.series.name, page.series.position) : "This book is not part of a series."}</p>
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
        <li key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></li>
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
          <li key={link.href}><a href={link.href} target="_blank" rel="noreferrer">{link.label}</a></li>
        ))}
      </ul>
    </section>
  );
}
