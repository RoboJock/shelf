"use client";

import { useEffect, useRef } from "react";

export function PlaceBook({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => done.current(), reduce ? 0 : 2400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="place-back" role="status" aria-label="Book added to the shelf">
      <div className="place-scene" aria-hidden="true">
        <div className="place-tray" />
        <div className="place-row">
          <div className="place-spine place-green" />
          <div className="place-spine place-pink" />
          <div className="place-spine place-blue" />
          <div className="place-spine place-yellow" />
        </div>
      </div>
    </div>
  );
}
