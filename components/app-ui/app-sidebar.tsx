"use client";

import * as React from "react";

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
    useSidebar,
} from "@/components/ui/sidebar"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useLinkStatus } from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link"

import {
    BrowseIcon,
    CreateIcon,
    HomeIcon,
    MessagesIcon,
    NotificationsIcon,
    TradeIcon,
    UserIcon,
    SearchIcon,
    PremiumIcon,
    SettingsIcon,
    Logo3,
    CommunitiesIcon,
    MenuIcon,
    SwapIcon,
    VerifiedIcon,
    Logo4,
    FlagLogo,
    Star2Icon,
    QuestsIcon,
} from "@/components/icons"
import { trpc } from "@/lib/trpc/client"
import { usePremiumOverlay } from "@/lib/premium/overlay-store"
import { WithAuth } from "@/components/auth/with-auth"
import { CreateDialog } from "./create-dialog"
import { NotificationsPanel } from "@/components/notifications/notifications-panel"
import { useAuthSession } from "@/hooks/use-auth-session"
import { GooDropdown } from "@/components/ui/goo-dropdown"

// Dims the row while its route loads (useLinkStatus must render inside the
// <Link>). The 150ms transition delay keeps fast navigations flash-free —
// on an instant nav the pending state clears before the dim becomes visible.
function NavLinkPending({ children }: { children: React.ReactNode }) {
    const { pending } = useLinkStatus()
    return (
        <span
            data-pending={pending || undefined}
            className="flex w-full items-center transition-opacity delay-150 duration-200 data-[pending]:opacity-60"
        >
            {children}
        </span>
    )
}

const items = [
    {
        title: "Home",
        url: "/home",
        icon: HomeIcon,
    },
    {
        title: "Discover",
        url: "/discover",
        icon: BrowseIcon,
    },
    {
        title: "Search",
        url: "/search",
        icon: SearchIcon,
    },
    // Shorts is pulled from the nav for now. The route (app/(app)/shorts) is
    // untouched and still reachable directly — put the entry back here to
    // restore it.
    {
        title: "Trade",
        url: "/trade",
        icon: TradeIcon,
    },
    {
        title: "Communities",
        url: "/communities",
        icon: CommunitiesIcon,
        protected: true,
    },
    {
        title: "Notifications",
        url: "#",
        icon: NotificationsIcon,
        protected: true,
    },
    {
        title: "Messages",
        url: "/messages",
        icon: MessagesIcon,
        protected: true,
    },
    {
        title: "Premium",
        url: "/premium",
        icon: VerifiedIcon,
        protected: true,
    },
    {
        title: "Create",
        url: "#",
        icon: CreateIcon,
        protected: true,
        isCreate: true,
    },
    {
        title: "Profile",
        url: "/profile",
        icon: UserIcon,
        protected: true,
    },
]

export function AppSidebar() {
    const { state, isMobile, setOpen, setOpenMobile, setHovered } = useSidebar()
    const { data: session } = useAuthSession()
    // Premium nav gate: non-subscribers get the upgrade overlay instead of the
    // hub. While status is loading the item navigates; the hub pops the
    // overlay itself for un-entitled visitors, so the race is covered.
    const { data: premiumStatus } = trpc.premium.getStatus.useQuery(undefined, { enabled: !!session?.user })
    const openPremiumOverlay = usePremiumOverlay((s) => s.openOverlay)
    const [mounted, setMounted] = React.useState(false)
    React.useEffect(() => { setMounted(true) }, [])
    const pathname = usePathname()
    const router = useRouter()
    const leaveTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    // Cleanup on unmount
    React.useEffect(() => () => {
        if (leaveTimeout.current) clearTimeout(leaveTimeout.current)
    }, [])
    const [notificationsOpen, setNotificationsOpen] = React.useState(false)
    const [moreOpen, setMoreOpen] = React.useState(false)
    const utils = trpc.useUtils()

    // Hover-intent data prefetch: warm the destination's initial queries so the
    // page mounts with data already in the React Query cache (staleTime is 5m,
    // so it actually serves). prefetch* respects staleTime — repeat hovers are
    // free, and a fresh cache entry is never refetched.
    const prefetchForItem = (title: string) => {
        switch (title) {
            case "Home":
                utils.content.getVideoFeed.prefetchInfinite({ limit: 36 })
                utils.content.getVideoFeed.prefetchInfinite({ limit: 4, category: "IRL" })
                break
            case "Discover":
                utils.content.getFeed.prefetchInfinite({ type: "for-you", limit: 20 })
                break
            case "Trade":
                utils.trade.getFeed.prefetch()
                break
            case "Notifications":
                if (session?.user) utils.notification.getNotifications.prefetchInfinite({ limit: 30 })
                break
        }
    }
    const { data: unreadNotifs } = trpc.notification.getUnreadCount.useQuery(undefined, { enabled: !!session?.user })
    const { data: unreadMessages } = trpc.conversation.getUnreadCount.useQuery(undefined, { enabled: !!session?.user, refetchInterval: 30_000 })
    // Cmd/Ctrl+K jumps to the dedicated /search page (the old command-palette
    // dialog was removed in favor of the full search page).
    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                router.push("/search")
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [router])

    return (
        <>
            <Sidebar
                collapsible="offcanvas"
                className="fixed"
                overlay
                onMouseEnter={() => {
                    if (leaveTimeout.current) {
                        clearTimeout(leaveTimeout.current)
                        leaveTimeout.current = null
                    }
                    if (!isMobile) setHovered(true)
                }}
                onMouseLeave={() => {
                    if (!isMobile) {
                        leaveTimeout.current = setTimeout(() => {
                            setHovered(false)
                            leaveTimeout.current = null
                        }, 150)
                    }
                }}
            >
                <SidebarHeader className="!px-0">
                    <div className="flex w-full mt-2">
                        <div
                            key="logo"
                            className="flex w-(--sidebar-width-icon) items-center text-flexwhite justify-center shrink-0"
                        >
                            
                        </div>
                    </div>
                </SidebarHeader>
                <SidebarContent className="flex-initial">
                    <SidebarGroup className="!px-0">
                        <SidebarMenu className="gap-1 !items-start">
                            {items.map((item) => (
                                <SidebarMenuItem key={item.title} className="w-fit">
                                    {(() => {
                                        const isProfile = item.title === "Profile";
                                        const isPremiumGated = item.title === "Premium"
                                            && !!premiumStatus && !premiumStatus.entitled;
                                        const itemUrl = mounted && isProfile && session?.user?.username
                                            ? `/${session.user.username}`
                                            : isPremiumGated ? "#" : item.url;
                                        const isProtected = !!item.protected;
                                        const isUnauthenticated = !session?.user;
                                        const isSearch = item.title === "Search";
                                        const isNotificationsItem = item.title === "Notifications";
                                        const isActive = isSearch
                                            ? pathname === "/search"
                                            : isNotificationsItem
                                            ? notificationsOpen
                                            : itemUrl !== "#" && pathname === itemUrl;
                                        const commonContent = (
                                            <>
                                                <div className="flex w-(--sidebar-width-icon) h-11 items-center justify-center shrink-0 relative">
                                                    {mounted && isProfile && session?.user?.avatar_url ? (
                                                        <div className="size-7 rounded-full ring-2 ring-current p-[2px]">
                                                            <img
                                                                src={session.user.avatar_url}
                                                                alt={session.user.name || "Profile"}
                                                                className="size-full rounded-full object-cover"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <item.icon className="size-7" active={isActive} />
                                                    )}
                                                    {isNotificationsItem && (unreadNotifs?.count ?? 0) > 0 && (
                                                        <span className="absolute top-2 right-3.5 w-3 h-3 rounded-full bg-notification border-2 border-black text-black text-[10px] font-bold flex items-center justify-center">

                                                        </span>
                                                    )}
                                                    {item.title === "Messages" && (unreadMessages?.count ?? 0) > 0 && (
                                                        <span className="absolute top-2 right-3.5 w-3 h-3 rounded-full bg-notification border-2 border-black" />
                                                    )}
                                                </div>
                                                <AnimatePresence mode="wait">
                                                    {(state !== "collapsed" || isMobile) && (
                                                        <motion.span
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ 
                                                                opacity: 1, 
                                                                x: 0,
                                                                transition: { type: "tween", duration: 0.1, ease: "easeOut" } // Entrance speed
                                                            }}
                                                            exit={{ 
                                                                opacity: 0, 
                                                                
                                                                transition: { type: "tween", duration: 0.00, ease: "easeOut" } // Faster exit speed
                                                            }}
                                                            className="whitespace-nowrap pr-7"
                                                        >
                                                            {item.title}
                                                        </motion.span>
                                                    )}
                                                </AnimatePresence>
                                            </>
                                        );

                                        const button = (
                                            <SidebarMenuButton
                                                asChild={itemUrl !== "#"}
                                                size="lg"
                                                onMouseEnter={() => prefetchForItem(item.title)}
                                                onFocus={() => prefetchForItem(item.title)}
                                                className={cn(
                                                    "text-lg !w-auto !justify-start !p-0 transition-all duration-150 ease-in-out font-medium h-12 relative isolate hover:bg-transparent active:bg-transparent before:absolute before:inset-y-0 before:left-2 before:right-2 before:rounded-full before:z-[-1] before:transition-colors before:duration-150 hover:before:bg-sidebar-hover modal-trigger gap-0",
                                                    isActive ? "text-flexwhite font-bold" : "text-flexwhite/85 hover:text-white/85"
                                                )}
                                                onClick={(e) => {
                                                    const isNotifications = item.title === "Notifications";
                                                    const isModalTrigger = isNotifications || (isProtected && isUnauthenticated);

                                                    if (isModalTrigger) {
                                                        // Stop propagation for modal triggers to prevent top-loader ghosting
                                                        if (e.nativeEvent) {
                                                            e.nativeEvent.stopImmediatePropagation();
                                                        }
                                                        e.stopPropagation();
                                                        e.preventDefault();

                                                        setOpen(false);
                                                        setOpenMobile(false);
                                                    }

                                                    // For create: just close sidebar, let DialogTrigger handle opening
                                                    if (item.isCreate) {
                                                        setOpen(false);
                                                        setOpenMobile(false);
                                                    }

                                                    if (item.title === "Premium") {
                                                        // Subscribers navigate to the /premium hub;
                                                        // everyone else gets the upgrade overlay.
                                                        if (isPremiumGated) {
                                                            if (e.nativeEvent) e.nativeEvent.stopImmediatePropagation();
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            openPremiumOverlay();
                                                        }
                                                        setOpen(false);
                                                        setOpenMobile(false);
                                                    }

                                                    if (isSearch) {
                                                        // Navigates to /search; just close the sidebar.
                                                        setOpen(false);
                                                        setOpenMobile(false);
                                                    }

                                                    if (isNotifications && !isUnauthenticated) {
                                                        setNotificationsOpen(true);
                                                    }
                                                }}
                                            >
                                                {itemUrl === "#" ? (
                                                    <div className="flex w-full items-center cursor-pointer">
                                                        {commonContent}
                                                    </div>
                                                ) : (
                                                    <Link href={itemUrl} transitionTypes={["page-nav"]} className="flex w-full items-center">
                                                        <NavLinkPending>{commonContent}</NavLinkPending>
                                                    </Link>
                                                )}
                                            </SidebarMenuButton>
                                        );

                                        let content = button;
                                        if (item.isCreate) {
                                            content = <CreateDialog>{content}</CreateDialog>;
                                        }
                                        if (isProtected) {
                                            content = <WithAuth>{content}</WithAuth>;
                                        }

                                        return content;
                                    })()}
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroup>
                    <SidebarGroup />
                </SidebarContent>
                <SidebarFooter className="!px-0">
                    <SidebarMenu>
                        <SidebarMenuItem className="w-full">
                            <GooDropdown
                                className="w-full"
                                open={moreOpen}
                                onOpenChange={setMoreOpen}
                                side="top"
                                align="start"
                                // Panel starts at the "More" label (right of the
                                // icon column) instead of hugging the viewport edge.
                                shift={68}
                                width={320}
                                gap={8}
                                triggerClassName={cn(
                                    "text-md w-full flex items-center justify-start p-0 transition-all duration-150 ease-in-out text-flexwhite/85 hover:text-white/85 font-medium h-12 relative isolate hover:bg-transparent before:absolute before:inset-y-0 before:left-2 before:right-2 before:rounded-full before:z-[-1] before:transition-colors before:duration-150 hover:before:bg-sidebar-hover gap-0 cursor-pointer",
                                    moreOpen && "before:bg-sidebar-hover"
                                )}
                                trigger={
                                    <span className="flex w-full items-center">
                                        {/* Fallback matches SIDEBAR_WIDTH_ICON: the goo replica portals to
                                            <body>, outside the sidebar's --sidebar-width-icon scope, and the
                                            column collapsing there shifted the "More" label on open. */}
                                        <span className="flex w-[var(--sidebar-width-icon,4.25rem)] h-11 items-center justify-center shrink-0">
                                            <MenuIcon className="size-7" />
                                        </span>
                                        {/* initial={false}: the goo dropdown re-mounts this trigger
                                            inside its portal replica on open — without it the label
                                            replays its x:-10 entrance and visibly shifts. */}
                                        <AnimatePresence mode="wait" initial={false}>
                                            {(state !== "collapsed" || isMobile) && (
                                                <motion.span
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: -10 }}
                                                    transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                                                    className="whitespace-nowrap -ml-2"
                                                >
                                                    More
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </span>
                                }
                                items={[
                                    {
                                        key: "quests",
                                        href: "/quests",
                                        className: "gap-3 px-4 text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                                        label: (
                                            <>
                                                <QuestsIcon className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
                                                Quests
                                            </>
                                        ),
                                    },
                                    {
                                        key: "settings",
                                        href: "/settings",
                                        className: "gap-3 px-4 text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                                        label: (
                                            <>
                                                <SettingsIcon className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
                                                Settings
                                            </>
                                        ),
                                    },
                                ]}
                            />
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />

        </>
    )
}

