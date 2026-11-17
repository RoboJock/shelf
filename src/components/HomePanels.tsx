"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useShelf } from "./AppShell";
import { Cover } from "./library";
import { bookHref, type RelatedBook } from "../lib/details";
import { readRecent, type RecentSearch } from "../lib/recent";
import { loadSuggestions } from "../lib/suggestions";

export function HomePanels() {
  const { backend, shelves, shelvesReady } = useShelf();
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [suggestions, setSuggestions] = useState<{ books: RelatedBook[]; authors: string[] } | null>(null);

  useEffect(() => {
    setRecent(readRecent(localStorage));
  }, []);

  useEffect(() => {
    if (!shelvesReady) return;
    const controller = new AbortController();
    const mine = shelves.filter((shelf) => shelf.access !== "viewer");
    Promise.all(mine.map((shelf) => backend.books(shelf.id, shelf.ownerId)))
      .then((groups) => loadSuggestions(groups.flat(), controller.signal))
      .then((next) => {
        if (!controller.signal.aborted) setSuggestions(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setSuggestions({ books: [], authors: [] });
      });
    return () => controller.abort();
  }, [backend, shelves, shelvesReady]);

  return (
    <div className="home-panels">
      <section className="home-panel" aria-label="Recent searches">
        <h2>Recent searches</h2>
        {recent.length > 0 ? (
          <ul className="chips">
            {recent.map((item) => (
              <li key={item.text}>
                <Link href={`/search?q=${encodeURIComponent(item.text)}`}>{item.text}</Link>
              </li>
            ))}
          </ul>
        ) : <p>Titles and authors you search will show up here.</p>}
      </section>
      <section className="home-panel" aria-label="Suggested books and authors">
        <h2>Suggested</h2>
        {!shelvesReady || suggestions === null ? <p>Looking through your shelves…</p> : suggestions.books.length === 0 && suggestions.authors.length === 0 ? (
          <p>Add a book to a shelf and suggestions will follow its genres and authors.</p>
        ) : (
          <>
            {suggestions.books.length > 0 ? (
              <>
                <h3>Books</h3>
                <div className="home-books">
                  {suggestions.books.map((book) => (
                    <article key={book.id} className="book">
                      <Link href={bookHref(book.id, book.coverId)} className="book-link" aria-label={book.title}>
                        <Cover book={{ title: book.title, coverId: book.coverId }} />
                      </Link>
                      <h3><Link href={bookHref(book.id, book.coverId)}>{book.title}</Link></h3>
                      <p>{book.author}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
            {suggestions.authors.length > 0 ? (
              <>
                <h3>Authors</h3>
                <ul className="chips">
                  {suggestions.authors.map((author) => (
                    <li key={author}>
                      <Link href={`/search?q=${encodeURIComponent(author)}`}>{author}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
