"use client";

import { Suspense } from "react";
import { BookFetch, BookPage } from "../../components/BookPage";

export default function Page() {
  return (
    <Suspense fallback={<BookFetch />}>
      <BookPage />
    </Suspense>
  );
}
