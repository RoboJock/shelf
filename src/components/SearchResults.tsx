"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LibraryHit } from "../lib/books";
import { enrichBooks } from "../lib/google-books";
import { findBooks } from "../lib/search";
import { HitSection } from "./library";
import { SearchBox } from "./SearchBox";

export function SearchResults() {
  const params = useSearchParams();
  const submitted = params.get("q")?.trim() ?? "";
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [close, setClose] = useState(false);
  const [status, setStatus] = useState("");

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
        />
      ) : submitted ? <p className="status">Searching…</p> : null}
    </>
  );
}
