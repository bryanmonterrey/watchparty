import type { Metadata } from "next";
import { RevenueView } from "@/components/studio/revenue-view";

export const metadata: Metadata = { title: "Revenue · Studio" };

export default function StudioRevenuePage() {
  return <RevenueView />;
}
