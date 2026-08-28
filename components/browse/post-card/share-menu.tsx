"use client";

import React from "react";
import { Link, Mail, Upload, BookmarkPlus, Download, Feather, Plus } from "lucide-react";
import { GooDropdown, gooMenuItem, type GooDropdownItem } from "@/components/ui/goo-dropdown";
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

    // The rows are the app's standard menu rows — gooMenuItem, the same helper
    // PostOptionsMenu (the dots menu beside this one) builds from. This used
    // to hand-roll them with `rounded-full … hover:bg-white/5`, which painted
    // a pill fill on each row: the engine squircles rows and carries ONE
    // travelling hover pill for the whole list, so the pill rows read as a
    // different component from every other popover on the card.
    const items: GooDropdownItem[] = [
        gooMenuItem({ key: "copy-link", icon: <Link />, label: "Copy link", onClick: copyLink }),
        gooMenuItem({ key: "share-via", icon: <Upload />, label: "Share post via ..." }),
        gooMenuItem({ key: "send-chat", icon: <Mail />, label: "Send via Chat" }),
        gooMenuItem({
            key: "bookmark",
            icon: <BookmarkPlus />,
            label: "Bookmark to Folder",
            onClick: () => handleBookmark({ stopPropagation: () => { } } as React.MouseEvent),
        }),
        ...(hasVideo
            ? [
                  gooMenuItem({ key: "download-video", icon: <Download />, label: "Download video" }),
                  gooMenuItem({
                      key: "post-video",
                      // The helper sizes every svg in the icon slot to 18px;
                      // the little plus badge opts back out of that.
                      icon: (
                          <span className="relative">
                              <Feather />
                              <Plus className="absolute -bottom-0.5 -right-0.5 !size-2.5 stroke-[3]" />
                          </span>
                      ),
                      label: "Post Video",
                  }),
              ]
            : []),
    ];

    return (
        <GooDropdown
            side="top"
            // align END, not start. Share is the LAST button in the action row,
            // ~25px from the column's right border, and the panel is 256px wide
            // — anchored to the trigger's left edge it ran off the column to
            // the right: over the right rail's cards at xl, and over bare canvas
            // below that. The liquid engine only shifts to stay inside a
            // clipping ancestor (safeBox), and nothing clips at the column, so
            // it never came back. Verified in Chrome 2026-08-28: the glass was
            // blurring — a flat canvas just has nothing to show for it, which
            // read as "the share popover isn't blurring anything". Hanging left
            // puts it over the post, where the blur has content.
            align="end"
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
