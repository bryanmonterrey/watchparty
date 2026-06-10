"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopHome } from "./desktop-home";
import { MobileHome } from "./mobile-home";

// Conditional render (not CSS hiding) so the hidden variant's feed queries
// never fire — phones don't pay for the desktop feed and vice versa.
export function HomeView() {
    const isMobile = useIsMobile();
    return isMobile ? <MobileHome /> : <DesktopHome />;
}
