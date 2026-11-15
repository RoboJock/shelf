"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LibraryHit } from "../lib/books";
import { findBooks } from "../lib/search";
import { HitSection } from "./library";

export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const submitted = params.get("q")?.trim() ?? "";
  const [query, setQuery] = useState(submitted);
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [close, setClose] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setQuery(submitted);
    if (!submitted) {
      setHits([]);
      setStatus("Type a title or author.");
      return;
    }
    let cancel = false;
    setStatus("");
    setHits(null);
    findBooks(submitted, 12).then((result) => {
      if (cancel) return;
      setHits(result.hits);
      setClose(result.close);
      if (result.hits.length === 0) setStatus("No books matched that search.");
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

  return (
    <>
      <h1>Search</h1>
      <form
        className="search"
        onSubmit={(event) => {
          event.preventDefault();
          const q = query.trim();
          if (!q) return;
          router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Title or author"
          aria-label="Search for a book"
        />
        <button type="submit">Search</button>
      </form>
      {status ? <p className="status" role="status">{status}</p> : null}
      {hits ? (
        <HitSection
          title={close ? "Close matches" : "Open Library"}
          hits={hits}
          empty="Try another title or author."
        />
      ) : submitted ? <p className="status">Searching…</p> : null}
    </>
  );
}
