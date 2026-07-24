import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";

// Port of sidebar's (browse)/page.tsx — the authenticated home feed.
// HomeView picks desktop VideoFeed or the sectioned MobileHome per viewport.
export const metadata: Metadata = {
  title: "Home",
};

export default function AppHome() {
  return (
    <div className="hidden-scrollbar flex h-full max-w-full flex-col overflow-y-auto">
      
    </div>
  );
}
