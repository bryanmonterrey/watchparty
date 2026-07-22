"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import {
    Flag, Pin, PinOff,
    UserMinus, UserPlus,
    VolumeX, Ban, EyeOff,
    BarChart3, Code, Megaphone, Trash2, Sparkles, ListPlus, X
} from "lucide-react";
import { GooDropdown, type GooDropdownItem } from "@/components/ui/goo-dropdown";

// ── Types ──────────────────────────────────────────────────────────────────────

type ReportReason = "spam" | "harassment" | "hate_speech" | "misinformation" | "nudity" | "violence" | "other";

const REPORT_REASON_MAP: Record<string, ReportReason> = {
    "Spam or scam": "spam",
    "Harassment or bullying": "harassment",
    "Hate speech": "hate_speech",
    "Violence or threats": "violence",
    "Misleading information": "misinformation",
    "Nudity or adult content": "nudity",
    "Copyright violation": "other",
    "Other": "other",
};
const REPORT_REASONS = Object.keys(REPORT_REASON_MAP);

// ── Item builder ───────────────────────────────────────────────────────────────

function menuItem(
    Icon: React.ElementType,
    label: string,
    onClick?: () => void,
    variant: "default" | "danger" = "default",
    closeOnSelect = true,
): GooDropdownItem {
    return {
        key: label,
        onClick,
        closeOnSelect,
        className: cn(
            "gap-3 px-4 rounded-full cursor-pointer text-base font-bold group",
            variant === "danger"
                ? "text-red-500 hover:bg-red-500/10 hover:text-red-500"
                : "text-zinc-200 hover:bg-white/5 hover:text-white"
        ),
        label: (
            <>
                <Icon className={cn(
                    "w-[18px] h-[18px] shrink-0 transition-colors",
                    variant === "danger" ? "text-red-500" : "text-white group-hover:text-white"
                )} />
                <span className="truncate">{label}</span>
            </>
        ),
    };
}

// ── PostOptionsMenu ────────────────────────────────────────────────────────────

export interface PostOptionsMenuProps {
    postId: string;
    userId?: string | null;
    username?: string | null;
    onClose: () => void;
    onHide?: () => void;
    isOwnPost?: boolean;
    isPinned?: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Content of the trigger button (GooDropdown renders the <button> itself). */
    trigger: React.ReactNode;
    triggerClassName?: string;
}

export function PostOptionsMenu({
    postId, userId, username, onClose, onHide, isOwnPost, isPinned,
    open, onOpenChange, trigger, triggerClassName
}: PostOptionsMenuProps) {
    const [view, setView] = useState<"main" | "report">("main");
    const [reportSubmitted, setReportSubmitted] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const utils = trpc.useUtils();
    const submitReport = trpc.moderation.submitReport.useMutation();
    const pinPost = trpc.content.pinPost.useMutation({ onSuccess: onClose });
    const unpinPost = trpc.content.unpinPost.useMutation({ onSuccess: onClose });
    const notInterested = trpc.content.notInterested.useMutation();
    const deletePost = trpc.content.deletePost.useMutation({
        onSuccess: () => {
            // The card is already optimistically hidden; refresh the lists so
            // it stays gone after refetches.
            utils.content.getPostsByUser.invalidate();
            utils.feed.invalidate();
        },
    });
    const toggleHighlight = trpc.content.toggleHighlight.useMutation({ onSuccess: onClose });

    const handleOpenChange = (next: boolean) => {
        onOpenChange(next);
        if (!next) {
            setView("main");
            setReportSubmitted(false);
            setConfirmDelete(false);
        }
    };

    // Two-tap delete: first tap arms the row (menu stays open), second tap
    // deletes and removes the card instantly. Easier than a confirm dialog,
    // still one deliberate step away from an accident.
    const handleDelete = () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        deletePost.mutate({ postId });
        onHide?.();
        onClose();
    };

    const handleNotInterested = () => {
        notInterested.mutate({ subjectId: postId, authorId: userId ?? undefined, surface: "home" });
        onHide?.(); // optimistically remove the card
        onClose();
    };

    const handleReport = async (reasonText: string) => {
        const reason = REPORT_REASON_MAP[reasonText] ?? "other";
        await submitReport.mutateAsync({ targetPostId: postId, reason }).catch(() => { });
        setReportSubmitted(true);
        setTimeout(() => {
            onClose();
            setReportSubmitted(false);
            setView("main");
        }, 1500);
    };

    let header: React.ReactNode;
    let headerHeight = 0;
    let items: GooDropdownItem[];

    if (reportSubmitted) {
        items = [{
            key: "thanks",
            type: "label",
            height: 72,
            className: "justify-center px-4 text-sm font-medium text-zinc-300",
            label: "Thanks for the report. We'll review it.",
        }];
    } else if (view === "report") {
        headerHeight = 40;
        header = (
            <div className="flex h-full items-center px-4 gap-3 border-b border-white/5">
                <button
                    onClick={() => setView("main")}
                    className="p-1 -ml-1 text-zinc-400 hover:text-white transition-colors"
                    aria-label="Back"
                >
                    <X className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-white">Report post</span>
            </div>
        );
        items = REPORT_REASONS.map(reason =>
            menuItem(Flag, reason, () => handleReport(reason), "default", false)
        );
    } else if (isOwnPost) {
        items = [
            menuItem(
                Trash2,
                confirmDelete ? "Tap again to confirm" : "Delete",
                handleDelete,
                "danger",
                false, // stays open so the armed state is visible
            ),
            menuItem(
                isPinned ? PinOff : Pin,
                isPinned ? "Unpin from profile" : "Pin to your profile",
                () => isPinned ? unpinPost.mutate({ postId }) : pinPost.mutate({ postId })
            ),
            menuItem(Sparkles, "Add/remove from Highlights", () => toggleHighlight.mutate({ postId })),
        ];
    } else {
        items = [
            menuItem(EyeOff, "Not interested in this post", handleNotInterested),
            menuItem(UserMinus, `Unfollow @${username || "user"}`),
            menuItem(UserPlus, `Subscribe to @${username || "user"}`),
            menuItem(ListPlus, "Add/remove from Lists"),
            menuItem(VolumeX, "Mute"),
            menuItem(Ban, `Block @${username || "user"}`),
            menuItem(BarChart3, "View post activity"),
            menuItem(Code, "Embed post"),
            menuItem(Flag, "Report post", () => setView("report"), "default", false),
            menuItem(Megaphone, "Request Community Note"),
        ];
    }

    return (
        <GooDropdown
            open={open}
            onOpenChange={handleOpenChange}
            side="bottom"
            align="end"
            width={288}
            gap={8}
            fill="#0a0a0a"
            panelRadius={24}
            itemHeight={44}
            stopPropagation
            triggerAriaLabel="Post options"
            triggerClassName={triggerClassName}
            trigger={trigger}
            header={header}
            headerHeight={headerHeight}
            items={items}
        />
    );
}
