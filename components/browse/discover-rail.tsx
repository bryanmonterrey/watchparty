"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { BookmarkIcon } from "@/components/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { PostComposerDialog } from "./post-composer-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Left rail of the discover 3-column layout. Geometry taken straight from the
// Figma rects in desktopdesigns/discoverlanding.svg (1512 frame):
//   placeholder card  x35 y102 373×306 r39
//   Post pill         x35 y437 373×108 r54  #E5C1FF
//   user chip         x35 y839 373×108 r54  (bottom margin 35)
// Header is 64px, so content top padding = 102 − 64 = 38.
export function DiscoverRail() {
    const [composerOpen, setComposerOpen] = useState(false);
    const { data: session } = useAuthSession();
    const user = session?.user as
        | { name?: string | null; username?: string | null; avatar_url?: string | null; image?: string | null }
        | undefined;
    const avatar = user?.avatar_url ?? user?.image ?? null;

    // Static (parent column never scrolls — the feed has its own scroller),
    // so no sticky needed; pt-[102px] puts the card top at design y=102.
    return (
        <div className="flex h-screen flex-col pt-[82px] pb-[35px]">
            <div className="w-full">
                {/* Placeholder card above the Post pill, per the design (its
                    contents aren't designed yet — likely nav/shortcuts). */}
                
                
            </div>
            <div className="mt-auto flex flex-col gap-3">
                
            
            <button
                    onClick={() => setComposerOpen(true)}
                    className="h-19 w-full rounded-full bg-white/95 text-[22px] font-extrabold text-black transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                    Post
            </button>

            <div className="mt-auto flex h-20 w-full items-center gap-3 rounded-full bg-zinc-900 px-5">
            
                <span className="size-14 shrink-0 overflow-hidden rounded-full bg-muted">
                    {avatar && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="size-full object-cover" />
                    )}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold">{user?.name ?? user?.username ?? ""}</p>
                    <p className="truncate text-sm text-muted-foreground">@{user?.username ?? ""}</p>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label="More"
                        className="rounded-full p-1 text-muted-foreground outline-none transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <MoreHorizontal className="size-6 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" className="w-48">
                        <DropdownMenuItem asChild>
                            <Link href="/discover/bookmarks" className="cursor-pointer">
                                <BookmarkIcon className="size-5" />
                                Bookmarks
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            </div>

            <PostComposerDialog open={composerOpen} onOpenChange={setComposerOpen} mode="post" />
        </div>
    );
}
