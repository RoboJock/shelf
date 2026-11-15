import { Suspense } from "react";
import { ShelfView } from "../../components/ShelfView";

export default function Page() {
  return (
    <Suspense fallback={<p className="status">Loading the shelf…</p>}>
      <ShelfView />
    </Suspense>
  );
}
