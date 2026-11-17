"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  if (!value) throw new Error("Armarium is still loading.");
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
          <div className="nav-left">
            <Link href="/" className="mark">Armarium</Link>
            <span className="nav-rule" aria-hidden="true" />
            <div className="nav-links">
              <Link href="/search" className="nav-link" aria-current={pathname === "/search" ? "page" : undefined}>Search</Link>
              <ShelvesMenu />
            </div>
          </div>
          <div className="nav-right">
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
          <div className="desk">{children}</div>
        </div>
      </main>
    </ShelfContext.Provider>
  );
}

function ShelvesMenu() {
  const pathname = usePathname();
  const { shelves } = useShelf();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div
      className={open ? "nav-menu open" : "nav-menu"}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <Link
        href="/shelf"
        className="nav-link"
        aria-current={pathname === "/shelf" ? "page" : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(false)}
      >
        Shelves
      </Link>
      <div className="nav-pop" role="navigation" aria-label="Your shelves">
        {shelves.length > 0 ? (
          <ul>
            {shelves.map((shelf) => (
              <li key={shelf.id}>
                <Link href={`/shelf?id=${encodeURIComponent(shelf.id)}`} onClick={() => setOpen(false)}>{shelf.name}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No shelves yet.</p>
        )}
      </div>
    </div>
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
