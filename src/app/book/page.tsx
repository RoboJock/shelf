"use client";

import { Suspense } from "react";
import { BookPage } from "../../components/BookPage";

export default function Page() {
  return (
    <Suspense fallback={<p className="status">Opening the book…</p>}>
      <BookPage />
    </Suspense>
  );
}
