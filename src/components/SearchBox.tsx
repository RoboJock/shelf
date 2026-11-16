"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { LibraryHit } from "../lib/books";
import { findBooks } from "../lib/search";
import { bookHref } from "../lib/details";
import { rememberSearch } from "../lib/recent";

export function SearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const field = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initial);
  const [preview, setPreview] = useState<LibraryHit[]>([]);
  const [close, setClose] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(initial);
    setOpen(false);
  }, [initial]);

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 2 || typed === initial.trim()) {
      setPreview([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findBooks(typed, 5, controller.signal, fetch, (result) => {
        if (result.hits.length === 0) return;
        setPreview(result.hits);
        setClose(result.close);
        setOpen(true);
      }).then((result) => {
        setPreview(result.hits);
        setClose(result.close);
        setOpen(result.hits.length > 0);
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setPreview([]);
        setOpen(false);
      });
    }, 80);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, initial]);

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: PointerEvent) {
      if (!field.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(q: string) {
    const next = q.trim();
    if (!next) return;
    setOpen(false);
    rememberSearch(next, localStorage);
    router.push(`/search?q=${encodeURIComponent(next)}`);
  }

  return (
    <form
      className="search"
      onSubmit={(event) => {
        event.preventDefault();
        go(query);
      }}
    >
      <div className={open ? "search-field open" : "search-field"} ref={field}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (preview.length > 0 && query.trim() !== initial.trim()) setOpen(true);
          }}
          placeholder="Title or author"
          aria-label="Search for a book"
          aria-expanded={open}
          aria-controls="search-preview"
          autoComplete="off"
        />
        {open ? (
          <ul className="suggest" id="search-preview" role="listbox">
            {close ? <li className="suggest-label">Close matches</li> : null}
            {preview.map((hit) => (
              <li key={hit.id} role="none">
                <button type="button" role="option" onClick={() => { rememberSearch(hit.title, localStorage); router.push(bookHref(hit.id, hit.coverId)); }}>
                  <span>{hit.title}</span>
                  <small>{hit.author}{hit.year ? ` · ${hit.year}` : ""}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="submit">Search</button>
    </form>
  );
}
