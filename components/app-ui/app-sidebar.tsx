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
    ShortsIcon,
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
} from "@/components/icons"
import { trpc } from "@/lib/trpc/client"
import { WithAuth } from "@/components/auth/with-auth"
import { CreateDialog } from "./create-dialog"
import { NotificationsPanel } from "@/components/notifications/notifications-panel"
import { useAuthSession } from "@/hooks/use-auth-session"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
    {
        title: "Shorts",
        url: "/shorts",
        icon: ShortsIcon,
    },
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
                                        const itemUrl = mounted && isProfile && session?.user?.username
                                            ? `/${session.user.username}`
                                            : item.url;
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
                                                className={cn(
                                                    "text-lg !w-auto !justify-start !p-0 transition-all duration-150 ease-in-out font-medium h-12 relative isolate hover:bg-transparent active:bg-transparent before:absolute before:inset-y-0 before:left-2 before:right-2 before:rounded-full before:z-[-1] before:transition-colors before:duration-150 hover:before:bg-zinc-900 modal-trigger gap-0",
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
                                                        // Navigates to the /premium hub; the page's
                                                        // CTAs open the upgrade overlay.
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
                                                        {commonContent}
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
                            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                                <PopoverTrigger asChild>
                                    <SidebarMenuButton 
                                        size="lg" 
                                        className={cn(
                                            "text-md w-full !w-full !justify-start !p-0 transition-all duration-150 ease-in-out text-flexwhite/85 hover:text-white/85 font-medium h-12 relative isolate hover:bg-transparent before:absolute before:inset-y-0 before:left-2 before:right-2 before:rounded-full before:z-[-1] before:transition-colors before:duration-150 hover:before:bg-zinc-800/50 gap-0",
                                            moreOpen && "before:bg-zinc-800/50"
                                        )}
                                    >
                                        <div className="flex w-full items-center cursor-pointer">
                                            <div className="flex w-(--sidebar-width-icon) h-11 items-center justify-center shrink-0">
                                                <MenuIcon className="size-7" />
                                            </div>
                                            <AnimatePresence mode="wait">
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
                                        </div>
                                    </SidebarMenuButton>
                                </PopoverTrigger>
                                <PopoverContent 
                                    side="top" 
                                    align="end" 
                                    sideOffset={8}
                                    className="w-80 ml-12 bg-black border-flexborder/75 rounded-3xl shadow-xl p-1.5 overflow-hidden flex flex-col gap-1 z-50"
                                >
                                    <Link
                                        href="/settings"
                                        onClick={() => setMoreOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white rounded-full transition-colors group"
                                    >
                                        <SettingsIcon className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" />
                                        Settings
                                    </Link>
                                </PopoverContent>
                            </Popover>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarFooter>
            </Sidebar>

            <NotificationsPanel open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />

        </>
    )
}

