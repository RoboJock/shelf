"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LibraryHit, ResultOrder } from "../lib/books";
import { bookHref, type RelatedBook } from "../lib/details";
import { enrichBooks } from "../lib/google-books";
import { findBooks } from "../lib/search";
import { loadAuthorRecommendations } from "../lib/suggestions";
import { Cover, HitSection } from "./library";
import { SearchBox } from "./SearchBox";

export function SearchResults() {
  const params = useSearchParams();
  const submitted = params.get("q")?.trim() ?? "";
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [close, setClose] = useState(false);
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState<ResultOrder>("relevance");
  const [authorRecs, setAuthorRecs] = useState<{ author: string; books: RelatedBook[]; authors: string[] } | null>(null);
  const seed = hits?.map((hit) => `${hit.id}\n${hit.author}`).join("|") ?? "";

  useEffect(() => {
    if (!submitted) {
      setHits([]);
      setStatus("Type a title or author.");
      return;
    }
    let cancel = false;
    setStatus("");
    setHits(null);
    findBooks(submitted, 12, undefined, fetch, (result) => {
      if (cancel || result.hits.length === 0) return;
      setHits(result.hits);
      setClose(result.close);
      setStatus("");
    }).then((result) => {
      if (cancel) return;
      setHits(result.hits);
      setClose(result.close);
      if (result.hits.length === 0) setStatus("No books matched that search.");
      void enrichBooks(result.hits).then((richer) => {
        if (!cancel) setHits(richer);
      });
    }).catch((error: unknown) => {
      if (cancel) return;
      setHits([]);
      setClose(false);
      setStatus(error instanceof Error ? error.message : "Open Library did not answer.");
    });
    return () => {
      cancel = true;
    };
  }, [submitted]);

  useEffect(() => {
    if (!hits || hits.length === 0) {
      setAuthorRecs(null);
      return;
    }
    const controller = new AbortController();
    setAuthorRecs(null);
    loadAuthorRecommendations(hits, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setAuthorRecs(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setAuthorRecs(null);
      });
    return () => controller.abort();
  }, [seed]);

  return (
    <>
      <h1>Search</h1>
      <SearchBox initial={submitted} />
      {status ? <p className="status" role="status">{status}</p> : null}
      {hits ? (
        <HitSection
          title={close ? "Close matches" : "Open Library"}
          hits={hits}
          empty="Try another title or author."
          order={order}
          onOrder={setOrder}
        />
      ) : submitted ? <p className="status">Searching…</p> : null}
      {authorRecs && authorRecs.books.length > 0 ? (
        <section className="related" aria-label={`More by ${authorRecs.author}`}>
          <h2>More by {authorRecs.author}</h2>
          <div className="related-row">
            {authorRecs.books.map((book) => (
              <article key={book.id} className="book">
                <Link href={bookHref(book.id, book.coverId)} className="book-link" aria-label={book.title}>
                  <Cover book={{ title: book.title, coverId: book.coverId }} />
                </Link>
                <h3><Link href={bookHref(book.id, book.coverId)}>{book.title}</Link></h3>
                <p>{book.year ? book.year : book.author}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {authorRecs && authorRecs.authors.length > 0 ? (
        <section className="related" aria-label={`Authors like ${authorRecs.author}`}>
          <h2>Authors like {authorRecs.author}</h2>
          <ul className="chips">
            {authorRecs.authors.map((author) => (
              <li key={author}>
                <Link href={`/search?q=${encodeURIComponent(author)}`}>{author}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
