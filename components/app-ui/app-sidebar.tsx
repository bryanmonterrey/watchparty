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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

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
    VideoIcon,
    SolanaIcon,
    SwapIcon,
    LiveIcon,
    VerifiedIcon,
    Logo4,
    FlagLogo,
    Star2Icon,
} from "@/components/icons"
import { trpc } from "@/lib/trpc/client"
import { WithAuth } from "@/components/auth/with-auth"
import { CreateDialog } from "./create-dialog"
import { NotificationsPanel } from "@/components/notifications/notifications-panel"
import * as CommandMenu from "@/components/ui/command-menu"
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
        url: "#",
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
        url: "#",
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
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [searchQuery, setSearchQuery] = React.useState("")
    const [debouncedQuery, setDebouncedQuery] = React.useState("")
    const [selectedFilters, setSelectedFilters] = React.useState<string[]>([])
    const toggleFilter = (filter: string) => {
        setSelectedFilters(prev => 
            prev.includes(filter) 
                ? prev.filter(f => f !== filter)
                : [...prev, filter]
        )
    }

    const isFilterActive = (filter: string) => selectedFilters.length === 0 || selectedFilters.includes(filter)

    // Reset search on close
    React.useEffect(() => {
        if (!searchOpen) {
            setSearchQuery("")
            setDebouncedQuery("")
            setSelectedFilters([])
        }
    }, [searchOpen])

    // Debounce search query
    React.useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Real search data
    const { data: userData } = trpc.user.search.useQuery(
        { query: debouncedQuery, limit: 3 },
        { enabled: searchOpen } // Enable even for empty query
    )

    const { data: contentData, isLoading: isLoadingContent } = trpc.content.search.useQuery(
        { query: debouncedQuery, limit: 3 },
        { enabled: debouncedQuery.length > 0 }
    )


    const hasResults = (isFilterActive("Users") && (userData?.users?.length ?? 0) > 0) || 
                       (isFilterActive("Videos") && (contentData?.videos?.length ?? 0) > 0) || 
                       (isFilterActive("Posts") && (contentData?.posts?.length ?? 0) > 0) || 
                       (isFilterActive("Coins") && (contentData?.tokens?.length ?? 0) > 0) ||
                       (isFilterActive("Streams") && ((contentData as any)?.streams?.length ?? 0) > 0);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setSearchOpen((open) => !open)
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

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
                    if (!isMobile && !searchOpen) setHovered(true)
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
                                            ? searchOpen || pathname === "/search"
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
                                                        <span className="absolute top-2 right-3.5 w-3 h-3 rounded-full bg-twitter2 border-2 border-black text-black text-[10px] font-bold flex items-center justify-center">

                                                        </span>
                                                    )}
                                                    {item.title === "Messages" && (unreadMessages?.count ?? 0) > 0 && (
                                                        <span className="absolute top-2 right-3.5 w-3 h-3 rounded-full bg-twitter2 border-2 border-black" />
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
                                                    const isModalTrigger = isSearch || isNotifications || (isProtected && isUnauthenticated);

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

                                                    if (isSearch) {
                                                        setSearchOpen(true);
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

            <CommandMenu.Dialog open={searchOpen} onOpenChange={setSearchOpen}>
                <CommandMenu.Input 
                    placeholder="Search anything..." 
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && searchQuery.trim()) {
                            e.preventDefault();
                            setSearchOpen(false);
                            router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                        }
                    }}
                />
                <div className="px-6 py-4 flex flex-col gap-3">
                    <CommandMenu.Subheader>Searching for</CommandMenu.Subheader>
                    <div className="flex flex-wrap gap-2">
                        {["Videos", "Posts", "Users", "Coins", "Streams"].map((filter) => (
                            <CommandMenu.Tag 
                                key={filter}
                                active={selectedFilters.includes(filter)}
                                onClick={() => toggleFilter(filter)}
                            >
                                {filter}
                            </CommandMenu.Tag>
                        ))}
                    </div>
                </div>
                <CommandMenu.Divider />
                <CommandMenu.List>
                    {(debouncedQuery.length === 0 || hasResults || isLoadingContent) ? (
                        <>
                            {debouncedQuery.length > 0 && (
                                <>
                                    {Boolean(isFilterActive("Streams") && (contentData as any)?.streams?.length > 0) && (
                                        <CommandMenu.Group heading="Streams">
                                            {(contentData as any)?.streams?.map((stream: any) => (
                                                <CommandMenu.Item 
                                                    key={stream.id}
                                                    onSelect={() => {
                                                        setSearchOpen(false);
                                                        router.push(`/stream/${stream.username || stream.id}`);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center gap-2">
                                                            <div className="relative">
                                                                <CommandMenu.ItemIcon as={LiveIcon} />
                                                                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-zinc-950 animate-pulse" />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium">{stream.username || "Live Stream"}</span>
                                                                <span className="text-[10px] text-zinc-500 truncate max-w-[180px]">{stream.title || "Join the broadcast"}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] font-medium text-zinc-400">
                                                            1.2k watching
                                                        </div>
                                                    </div>
                                                </CommandMenu.Item>
                                            ))}
                                        </CommandMenu.Group>
                                    )}

                                    {Boolean(isFilterActive("Videos") && contentData?.videos?.length) && (
                                        <CommandMenu.Group heading="Videos">
                                            {contentData?.videos?.map((video: any) => (
                                                <CommandMenu.Item 
                                                    key={video.id}
                                                    onSelect={() => {
                                                        setSearchOpen(false);
                                                        router.push(`/video/${video.id}`);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center gap-2">
                                                            {video.tokenImage ? (
                                                                <div className="size-6 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0 overflow-hidden">
                                                                    <img 
                                                                        src={video.tokenImage} 
                                                                        alt={video.tokenTicker || "Token"} 
                                                                        width={24} 
                                                                        height={24} 
                                                                        className="size-full object-cover" 
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <CommandMenu.ItemIcon as={VideoIcon} />
                                                            )}
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium truncate max-w-[200px]">{video.title}</span>
                                                                <span className="text-[10px] text-zinc-500">Video Content</span>
                                                            </div>
                                                        </div>
                                                        {video.tokenTicker && (
                                                            <div className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-400">
                                                                ${video.tokenTicker}
                                                            </div>
                                                        )}
                                                    </div>
                                                </CommandMenu.Item>
                                            ))}
                                        </CommandMenu.Group>
                                    )}

                                    {Boolean(isFilterActive("Posts") && contentData?.posts?.length) && (
                                        <CommandMenu.Group heading="Posts">
                                            {contentData?.posts?.map((post: any) => (
                                                <CommandMenu.Item 
                                                    key={post.id}
                                                    onSelect={() => {
                                                        setSearchOpen(false);
                                                        router.push(`/discover/post/${post.id}`);
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <div className="flex items-center gap-2">
                                                            {post.tokenImage ? (
                                                                <div className="size-6 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0 overflow-hidden">
                                                                    <img 
                                                                        src={post.tokenImage} 
                                                                        alt={post.tokenTicker || "Token"} 
                                                                        width={24} 
                                                                        height={24} 
                                                                        className="size-full object-cover" 
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <CommandMenu.ItemIcon as={MessagesIcon} />
                                                            )}
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-medium truncate max-w-[200px]">{post.content || "Post"}</span>
                                                                <span className="text-[10px] text-zinc-500">Social Post</span>
                                                            </div>
                                                        </div>
                                                        {post.tokenTicker && (
                                                            <div className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-400">
                                                                ${post.tokenTicker}
                                                            </div>
                                                        )}
                                                    </div>
                                                </CommandMenu.Item>
                                            ))}
                                        </CommandMenu.Group>
                                    )}
                                </>
                            )}

                            {Boolean(isFilterActive("Users") && (userData?.users?.length || debouncedQuery.length === 0)) && (
                                <CommandMenu.Group heading="Users">
                                    {userData?.users?.map((user) => (
                                        <CommandMenu.Item 
                                            key={user.id}
                                            onSelect={() => {
                                                setSearchOpen(false);
                                                router.push(`/${user.username || user.id}`);
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Avatar className="size-6 shrink-0 border border-zinc-800">
                                                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.name || "User"} />}
                                                    <AvatarFallback className="text-[10px] font-bold bg-zinc-900 text-zinc-400">
                                                        
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium">{user.name || user.username || "User"}</span>
                                                    {user.username && <span className="text-[10px] text-zinc-500 line-clamp-1">@{user.username}</span>}
                                                </div>
                                            </div>
                                        </CommandMenu.Item>
                                    ))}
                                </CommandMenu.Group>
                            )}

                            {Boolean(isFilterActive("Coins") && debouncedQuery.length > 0 && contentData?.tokens?.length) && (
                                <CommandMenu.Group heading="Coins">
                                    {(contentData as any)?.tokens?.map((token: any) => (
                                        <CommandMenu.Item 
                                            key={token.id}
                                            onSelect={() => {
                                                setSearchOpen(false);
                                                router.push(`/trade?token=${token.tokenAddress || token.id}`);
                                            }}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <div className="size-6 flex items-center justify-center rounded-full bg-zinc-900 border border-zinc-800 shrink-0 overflow-hidden">
                                                        {token.imageUrl ? (
                                                            <img 
                                                                src={token.imageUrl} 
                                                                alt={token.ticker} 
                                                                width={24} 
                                                                height={24} 
                                                                className="size-full object-cover" 
                                                            />
                                                        ) : (
                                                            <SolanaIcon className="size-4" />
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-sm font-bold text-white">${token.ticker}</span>
                                                            <span className="text-[10px] text-zinc-500">{token.name}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end shrink-0">
                                                    <span className="text-[11px] font-bold text-zinc-200">MCap {token.marketCap}</span>
                                                    <span className="text-[10px] font-medium text-emerald-500">{token.change24h}</span>
                                                </div>
                                            </div>
                                        </CommandMenu.Item>
                                    ))}
                                </CommandMenu.Group>
                            )}

                            {debouncedQuery.length === 0 && (
                                <CommandMenu.Group heading="Settings">
                                    <CommandMenu.Item onSelect={() => { setSearchOpen(false); router.push("/profile"); }}>
                                        <CommandMenu.ItemIcon as={UserIcon} />
                                        Profile
                                    </CommandMenu.Item>
                                    <CommandMenu.Item onSelect={() => { setSearchOpen(false); router.push("/settings"); }}>
                                        <CommandMenu.ItemIcon as={SettingsIcon} />
                                        Settings
                                    </CommandMenu.Item>
                                </CommandMenu.Group>
                            )}
                        </>
                    ) : (
                        <CommandMenu.Empty>No results found for "{debouncedQuery}"</CommandMenu.Empty>
                    )}
                </CommandMenu.List>
                <CommandMenu.Footer>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                            <CommandMenu.FooterKeyBox>Esc</CommandMenu.FooterKeyBox>
                            <span className="text-[10px] text-zinc-500 font-medium">to close</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <CommandMenu.FooterKeyBox>↵</CommandMenu.FooterKeyBox>
                            <span className="text-[10px] text-zinc-500 font-medium">to select</span>
                        </div>
                    </div>
                </CommandMenu.Footer>
            </CommandMenu.Dialog>
        </>
    )
}

