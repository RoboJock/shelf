"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { firebasePublicConfig } from "../lib/backend";
import { findBooks } from "../lib/search";
import type { LibraryHit } from "../lib/books";
import { useShelf } from "./AppShell";
import { HitSection } from "./library";

export function HomeDesk() {
  const { backend } = useShelf();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<LibraryHit[] | null>(null);
  const [previewClose, setPreviewClose] = useState(false);
  const config = firebasePublicConfig();

  useEffect(() => {
    const typed = query.trim();
    if (typed.length < 2) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      findBooks(typed, 6, controller.signal).then((result) => {
        setPreview(result.hits);
        setPreviewClose(result.close);
      }).catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setPreview([]);
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <>
      <h1>What are you reading?</h1>
      <p className="lede">Search for a book, then add it to a shelf.</p>
      {backend.mode === "local" ? (
        <p className="banner">
          {config
            ? `Firebase project ${config.projectId} is connected, but sign-in is still off, so this shelf stays in the browser.`
            : "Firebase is not connected, so this shelf stays in the browser until its data is cleared."}
        </p>
      ) : null}
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
      {preview && preview.length > 0 ? (
        <HitSection title={previewClose ? "Close matches" : "Preview"} hits={preview} />
      ) : null}
    </>
  );
}
