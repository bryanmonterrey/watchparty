import type { Metadata } from "next";
import { ContentView } from "@/components/studio/content-view";

export const metadata: Metadata = { title: "Content · Studio" };

export default function StudioContentPage() {
  return <ContentView />;
}
