import { Suspense } from "react";
import { PublicShelves } from "../../components/PublicShelves";

export default function Page() {
  return (
    <Suspense fallback={<p className="status">Loading the shelf…</p>}>
      <PublicShelves />
    </Suspense>
  );
}
