"use client";

import { firebasePublicConfig } from "../lib/backend";
import { useShelf } from "./AppShell";
import { SearchBox } from "./SearchBox";

export function HomeDesk() {
  const { backend } = useShelf();
  const config = firebasePublicConfig();

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
      <SearchBox />
    </>
  );
}
