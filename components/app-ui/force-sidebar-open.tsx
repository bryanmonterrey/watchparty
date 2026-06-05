"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";

const FORCE_OPEN_ROUTES = ["/browse"];

export function ForceSidebarOpen() {
    const { setOpen } = useSidebar();
    const pathname = usePathname();

    useEffect(() => {
        if (FORCE_OPEN_ROUTES.some((route) => pathname.startsWith(route))) {
            setOpen(true);
        }
    }, [pathname, setOpen]);

    return null;
}
