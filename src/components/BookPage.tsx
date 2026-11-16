"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookFacts, Cover } from "./library";
import { loadBookPage, type BookLink, type BookPageInfo } from "../lib/details";

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
    <article className="detail">
      <Cover book={book} />
      <div>
        <h1>{book.title}</h1>
        <p className="byline">{book.author}{book.year ? ` · ${book.year}` : ""}</p>
        {page.summary ? <p className="summary">{page.summary}</p> : null}
        <BookFacts book={{ ...book, description: null }} />
        <LinkGroup title="Where to buy" links={page.purchase} />
        {page.series ? (
          <section>
            <h2>{page.series.name}</h2>
            {page.series.position ? <p className="meta">Position {page.series.position}</p> : null}
            {page.series.summary ? <p className="summary">{page.series.summary}</p> : null}
            <LinkGroup title="" links={page.series.links} />
          </section>
        ) : null}
        <LinkGroup title={book.author} links={page.authorLinks} />
        <LinkGroup title="More about this book" links={page.reading} />
      </div>
    </article>
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
