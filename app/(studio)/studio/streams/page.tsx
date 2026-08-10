import type { Metadata } from "next";
import { StreamManager } from "@/components/studio/stream-manager";

export const metadata: Metadata = { title: "Streams · Studio" };

export default function StudioStreamsPage() {
  return <StreamManager />;
}
