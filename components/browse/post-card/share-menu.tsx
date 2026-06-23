"use client";

import React from "react";
import { Link, Mail, Upload, BookmarkPlus, Download, Feather, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ShareMenuProps {
    post: any;
    bookmarked: boolean;
    handleBookmark: (e: React.MouseEvent) => void;
}

export function ShareMenu({ post, bookmarked, handleBookmark }: ShareMenuProps) {
    const [open, setOpen] = React.useState(false);

    const handleAction = (e: React.MouseEvent, action: () => void) => {
        e.stopPropagation();
        action();
        setOpen(false);
    };

    const copyLink = () => {
        const url = `${window.location.origin}/discover/post/${post.id}`;
        navigator.clipboard.writeText(url);
    };

    const hasVideo = !!post.videoUrl || !!post.media?.some((m: any) => m.type === "video");

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        "text-postgray hover:bg-twitter2/[12%] cursor-pointer hover:text-white p-1.5 rounded-full transition-colors",
                        open && "text-white bg-twitter2/[12%]"
                    )}
                >
                    <Share2Icon className="w-[18px] h-[18px]" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-64 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50 flex flex-col gap-0.5"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={(e) => handleAction(e, copyLink)}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                >
                    <Link className="w-5 h-5 text-white transition-colors" />
                    <span>Copy link</span>
                </button>

                <button
                    onClick={(e) => e.stopPropagation()}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                >
                    <Upload className="w-5 h-5 text-white transition-colors" />
                    <span>Share post via ...</span>
                </button>

                <button
                    onClick={(e) => e.stopPropagation()}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                >
                    <Mail className="w-5 h-5 text-white transition-colors" />
                    <span>Send via Chat</span>
                </button>

                <button
                    onClick={(e) => handleAction(e, () => handleBookmark(e))}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                >
                    <BookmarkPlus className="w-5 h-5 text-white transition-colors" />
                    <span>Bookmark to Folder</span>
                </button>

                {hasVideo && (
                    <>
                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                        >
                            <Download className="w-5 h-5 text-white transition-colors" />
                            <span>Download video</span>
                        </button>

                        <button
                            onClick={(e) => e.stopPropagation()}
                            className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-[17px] font-bold text-white hover:bg-white/5 rounded-full transition-all group"
                        >
                            <div className="relative">
                                <Feather className="w-5 h-5 text-white transition-colors" />
                                <Plus className="w-2.5 h-2.5 text-white absolute -bottom-0.5 -right-0.5 stroke-[3]" />
                            </div>
                            <span>Post Video</span>
                        </button>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
