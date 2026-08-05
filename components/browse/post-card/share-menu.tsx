"use client";

import React from "react";
import { Link, Mail, Upload, BookmarkPlus, Download, Feather, Plus } from "lucide-react";
import { GooDropdown, type GooDropdownItem } from "@/components/ui/goo-dropdown";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkForwardIcon } from "@hugeicons/core-free-icons";

interface ShareMenuProps {
    post: any;
    bookmarked: boolean;
    handleBookmark: (e: React.MouseEvent) => void;
}

export function ShareMenu({ post, bookmarked, handleBookmark }: ShareMenuProps) {
    const copyLink = () => {
        const url = `${window.location.origin}/status/${post.id}`;
        navigator.clipboard.writeText(url);
    };

    const hasVideo = !!post.videoUrl || !!post.media?.some((m: any) => m.type === "video");

    const rowClass = "gap-3 px-4 rounded-full cursor-pointer text-[17px] font-bold text-white hover:bg-white/5";

    const items: GooDropdownItem[] = [
        {
            key: "copy-link",
            onClick: copyLink,
            className: rowClass,
            label: (
                <>
                    <Link className="w-5 h-5 text-white transition-colors" />
                    <span>Copy link</span>
                </>
            ),
        },
        {
            key: "share-via",
            className: rowClass,
            label: (
                <>
                    <Upload className="w-5 h-5 text-white transition-colors" />
                    <span>Share post via ...</span>
                </>
            ),
        },
        {
            key: "send-chat",
            className: rowClass,
            label: (
                <>
                    <Mail className="w-5 h-5 text-white transition-colors" />
                    <span>Send via Chat</span>
                </>
            ),
        },
        {
            key: "bookmark",
            onClick: () => handleBookmark({ stopPropagation: () => { } } as React.MouseEvent),
            className: rowClass,
            label: (
                <>
                    <BookmarkPlus className="w-5 h-5 text-white transition-colors" />
                    <span>Bookmark to Folder</span>
                </>
            ),
        },
        ...(hasVideo
            ? [
                  {
                      key: "download-video",
                      className: rowClass,
                      label: (
                          <>
                              <Download className="w-5 h-5 text-white transition-colors" />
                              <span>Download video</span>
                          </>
                      ),
                  },
                  {
                      key: "post-video",
                      className: rowClass,
                      label: (
                          <>
                              <span className="relative">
                                  <Feather className="w-5 h-5 text-white transition-colors" />
                                  <Plus className="w-2.5 h-2.5 text-white absolute -bottom-0.5 -right-0.5 stroke-[3]" />
                              </span>
                              <span>Post Video</span>
                          </>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <GooDropdown
            side="top"
            align="start"
            width={256}
            gap={8}
            stopPropagation
            triggerAriaLabel="Share"
            triggerClassName="text-postgray hover:bg-twitter2/[12%] cursor-pointer hover:text-white p-1.5 rounded-full transition-colors aria-expanded:text-white aria-expanded:bg-twitter2/[12%]"
            // LinkForward, the mirror of the LinkBackward that means reply in chat —
            // so the pair reads as one gesture in two directions.
            trigger={<HugeiconsIcon icon={LinkForwardIcon} className="size-[18px]" strokeWidth={2} />}
            items={items}
        />
    );
}
