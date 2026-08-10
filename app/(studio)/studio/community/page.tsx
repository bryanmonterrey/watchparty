import type { Metadata } from "next";
import { CommunityView } from "@/components/studio/community-view";

export const metadata: Metadata = { title: "Community · Studio" };

export default function StudioCommunityPage() {
  return <CommunityView />;
}
