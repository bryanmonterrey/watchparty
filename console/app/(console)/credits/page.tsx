import { Suspense } from "react";
import { CreditsView } from "@/components/console/credits-view";

// Suspense boundary: CreditsView reads ?key= via useSearchParams, which
// otherwise fails the static prerender pass.
export default function CreditsPage() {
  return (
    <Suspense>
      <CreditsView />
    </Suspense>
  );
}
