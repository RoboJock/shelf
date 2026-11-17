"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createBackend, type AppUser, type Backend, type BookShelf } from "../lib/backend";

interface ShelfContextValue {
  backend: Backend;
  user: AppUser | null;
  shelves: BookShelf[];
  shelvesReady: boolean;
  refreshShelves: () => void;
}

const ShelfContext = createContext<ShelfContextValue | null>(null);

export function useShelf(): ShelfContextValue {
  const value = useContext(ShelfContext);
  if (!value) throw new Error("Shelf is still loading.");
  return value;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const backend = useMemo<Backend>(() => createBackend(), []);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [user, setUser] = useState<AppUser | null>(null);
  const [shelves, setShelves] = useState<BookShelf[]>([]);
  const [shelvesReady, setShelvesReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "dark" ? "dark" : "light");
  }, []);

  useEffect(() => backend.subscribe(setUser), [backend]);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    backend.shelves().then((next) => {
      if (!cancel) setShelves(next);
    }).catch(() => {
      if (!cancel) setShelves([]);
    }).finally(() => {
      if (!cancel) setShelvesReady(true);
    });
    return () => {
      cancel = true;
    };
  }, [backend, user, tick]);

  return (
    <ShelfContext.Provider value={{ backend, user, shelves, shelvesReady, refreshShelves: () => setTick((value) => value + 1) }}>
      <main className="page">
        <nav>
          <Link href="/" className="mark">Shelf</Link>
          <div className="nav-right">
            <Link href="/search" className="who" aria-current={pathname === "/search" ? "page" : undefined}>Search</Link>
            <button
              type="button"
              className="theme-toggle"
              aria-pressed={theme === "dark"}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
                document.documentElement.dataset.theme = next;
                localStorage.setItem("shelf-theme", next);
              }}
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
            </button>
            <Link href="/login" className="who">{user?.name ?? "Guest"}</Link>
            <Link href="/login" className="who login">Log in</Link>
          </div>
        </nav>
        <div className="workspace">
          <ShelfRail />
          <div className="desk">{children}</div>
        </div>
      </main>
    </ShelfContext.Provider>
  );
}

function ShelfRail() {
  const { shelves, backend, refreshShelves } = useShelf();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const openId = pathname === "/shelf" ? params.get("id") : null;
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");

  return (
    <aside className="rail">
      <p>Shelves</p>
      <ul>
        {shelves.map((shelf) => (
          <li key={shelf.id}>
            <Link href={`/shelf?id=${encodeURIComponent(shelf.id)}`} className={shelf.id === openId ? "on" : undefined}>
              {shelf.name}
            </Link>
          </li>
        ))}
      </ul>
      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setStatus("");
            void backend.createShelf(draft).then((shelf) => {
              setCreating(false);
              setDraft("");
              refreshShelves();
              router.push(`/shelf?id=${encodeURIComponent(shelf.id)}`);
            }).catch((error: unknown) => {
              setStatus(error instanceof Error ? error.message : "Could not create that shelf.");
            });
          }}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="New shelf name"
            placeholder="Name"
            maxLength={40}
            required
            autoFocus
          />
          <button type="submit">Add</button>
        </form>
      ) : (
        <button type="button" className="rail-add" onClick={() => { setCreating(true); setDraft(""); }}>New shelf</button>
      )}
      {status ? <p className="rail-status">{status}</p> : null}
    </aside>
  );
}

function SunIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M14.5 3.2a8.2 8.2 0 1 0 6.3 13.2A7.2 7.2 0 0 1 14.5 3.2z" />
    </svg>
  );
}
