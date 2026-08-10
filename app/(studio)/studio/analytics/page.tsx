import type { Metadata } from "next";
import { AnalyticsView } from "@/components/studio/analytics-view";

export const metadata: Metadata = { title: "Analytics · Studio" };

export default function StudioAnalyticsPage() {
  return <AnalyticsView />;
}
