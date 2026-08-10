"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Plus, Heart, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";
import { useNotificationsOverlay } from "@/lib/notifications/overlay-store";

// Mobile top chrome from public/mobile designs/*.svg. Route-aware variants:
// - home/search/trade: hamburger + logo chip left, actions right
// - messages: big page title left, actions right
// - discover: hamburger left, centered wordmark, actions right
// Fixed overlay (same as the desktop AppHeader), so pages keep their pt-16.

function HeaderActions() {
    const openNotifications = useNotificationsOverlay((s) => s.openNotifications);
    const { data: session } = useAuthSession();
    const user = session?.user as { avatar_url?: string | null; image?: string | null; name?: string | null } | undefined;
    const avatar = user?.avatar_url ?? user?.image ?? null;

    return (
        <div className="flex items-center gap-4">
            <Link href="/feed?compose=1" aria-label="Create">
                <Plus className="size-7" />
            </Link>
            {/* Opens the panel the sidebar mounts — NOT a link. `/notifications`
                is not a route (the panel is the app's only notifications
                surface), so this was a 404 for anyone who reached it. */}
            <button
                type="button"
                onClick={openNotifications}
                aria-label="Notifications"
                className="relative cursor-pointer"
            >
                <Heart className="size-[26px]" />
                <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500" />
            </button>
            <Link href="/settings" aria-label="Profile" className="size-8 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                {/* The house rule is no letter/initial fallback anywhere — a
                    missing avatar is the shared default image, never a
                    generated monogram. This rendered `?` for a user with no
                    name at all. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar || "/avatar.png"} alt="" className="size-full object-cover" />
            </Link>
        </div>
    );
}

export function MobileHeader() {
    const pathname = usePathname();
    const { toggleSidebar } = useSidebar();

    const titled =
        pathname.startsWith("/messages") ? "Messages" :
        pathname.startsWith("/trade") ? "Trade" :
        null;
    const isDiscover = pathname.startsWith("/feed");

    return (
        <header
            className={cn(
                "fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-4 md:hidden",
                "bg-background/25 backdrop-blur-xl"
            )}
        >
            {titled ? (
                <h1 className="text-[28px] font-extrabold tracking-tight">{titled}</h1>
            ) : (
                <div className="flex items-center gap-3">
                    <button onClick={toggleSidebar} aria-label="Menu" className="p-1">
                        <Menu className="size-7" />
                    </button>
                    {!isDiscover && (
                        <Link href="/home" aria-label="Home" className="flex size-10 items-center justify-center overflow-hidden rounded-xl">
                            <Image src="/icon.svg" alt="Watchparty" width={28} height={28} priority className="size-7" />
                        </Link>
                    )}
                </div>
            )}

            {isDiscover && (
                <span className="absolute left-1/2 -translate-x-1/2 text-lg font-bold tracking-tight">
                    watchparty
                </span>
            )}

            <HeaderActions />
        </header>
    );
}
