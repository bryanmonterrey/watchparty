import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view2";

// New app home. HomeView2 → DesktopHome2 → HomeCarousel2 (the redesigned
// single full-bleed hero player). The frozen originals live in _legacy.
export const metadata: Metadata = {
  title: "Home",
};

export default function AppHome() {
  return (
    <div className="hidden-scrollbar flex h-full max-w-full flex-col overflow-y-auto">
      <HomeView />
    </div>
  );
}
