"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import {
    Flag, Pin, PinOff,
    UserMinus, UserPlus,
    VolumeX, Ban, EyeOff,
    BarChart3, Code, Megaphone, Trash2, Sparkles, ListPlus, X,
    Info, MessageCircle, Globe, Users, BadgeCheck, Coins, Check,
} from "lucide-react";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL, type GooDropdownItem } from "@/components/ui/goo-dropdown";

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
// Thin adapter over the app-standard gooMenuItem (goo-dropdown.tsx) — this
// menu's look IS the standard; the shared builder keeps every menu on it.

function menuItem(
    Icon: React.ElementType,
    label: string,
    onClick?: () => void,
    variant: "default" | "danger" = "default",
    closeOnSelect = true,
): GooDropdownItem {
    return gooMenuItem({ icon: <Icon />, label, onClick, variant, closeOnSelect });
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
    const [view, setView] = useState<"main" | "report" | "reply" | "disclosure" | "analytics">("main");
    const [reportSubmitted, setReportSubmitted] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [embedCopied, setEmbedCopied] = useState(false);

    const utils = trpc.useUtils();
    const submitReport = trpc.moderation.submitReport.useMutation();
    const pinPost = trpc.content.pinPost.useMutation({ onSuccess: onClose });
    const unpinPost = trpc.content.unpinPost.useMutation({ onSuccess: onClose });
    const notInterested = trpc.content.notInterested.useMutation();
    const deletePost = trpc.content.deletePost.useMutation({
        onSuccess: () => {
            // The card is already optimistically hidden; refresh everything
            // under content (profile lists + the merged feed router) so it
            // stays gone after refetches.
            utils.content.invalidate();
        },
    });
    const toggleHighlight = trpc.content.toggleHighlight.useMutation({ onSuccess: onClose });
    const updateSettings = trpc.content.updatePostSettings.useMutation({ onSuccess: onClose });
    // Stats load only when the analytics view opens. (getPost lives under
    // content — postRouter is merged into it, there is no `post` key.)
    const { data: analytics } = trpc.content.getPost.useQuery(
        { postId },
        { enabled: open && view === "analytics" },
    );

    const handleOpenChange = (next: boolean) => {
        onOpenChange(next);
        if (!next) {
            setView("main");
            setReportSubmitted(false);
            setConfirmDelete(false);
            setEmbedCopied(false);
        }
    };

    const handleEmbedCopy = () => {
        const snippet = `<iframe src="${window.location.origin}/embed/post/${postId}" width="500" height="420" style="border:none;border-radius:20px;overflow:hidden" title="watchparty post"></iframe>`;
        void navigator.clipboard.writeText(snippet);
        setEmbedCopied(true);
        setTimeout(() => {
            onClose();
            setEmbedCopied(false);
        }, 900);
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

    // Shared back-header for the sub-views (report / reply / disclosure / analytics).
    const subHeader = (title: string) => (
        <div className="flex h-full items-center px-4 gap-3 border-b border-white/5">
            <button
                onClick={() => setView("main")}
                className="p-1 -ml-1 text-zinc-400 hover:text-white transition-colors"
                aria-label="Back"
            >
                <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-white">{title}</span>
        </div>
    );

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
        header = subHeader("Report post");
        items = REPORT_REASONS.map(reason =>
            menuItem(Flag, reason, () => handleReport(reason), "default", false)
        );
    } else if (view === "reply") {
        headerHeight = 40;
        header = subHeader("Who can reply");
        items = [
            menuItem(Globe, "Everyone", () => updateSettings.mutate({ postId, replyPrivacy: "everyone" })),
            menuItem(Users, "Followers", () => updateSettings.mutate({ postId, replyPrivacy: "followers" })),
            menuItem(BadgeCheck, "Verified users", () => updateSettings.mutate({ postId, replyPrivacy: "verified" })),
            menuItem(Coins, "Coin holders", () => updateSettings.mutate({ postId, replyPrivacy: "token_holders" })),
        ];
    } else if (view === "disclosure") {
        headerHeight = 40;
        header = subHeader("Content disclosure");
        items = [
            menuItem(X, "Remove disclosure", () => updateSettings.mutate({ postId, hasContentWarning: false, contentWarningText: null })),
            ...["Sensitive content", "Graphic content", "Spoiler"].map((t) =>
                menuItem(Info, t, () => updateSettings.mutate({ postId, hasContentWarning: true, contentWarningText: t }))
            ),
        ];
    } else if (view === "analytics") {
        headerHeight = 40;
        header = subHeader("Post analytics");
        const stats: [string, number][] | null = analytics ? [
            ["Views", analytics.views ?? 0],
            ["Likes", analytics.likes ?? 0],
            ["Reposts", analytics.reposts ?? 0],
            ["Replies", analytics.comments ?? 0],
            ["Bookmarks", Number(analytics.bookmarks ?? 0)],
            ["Quotes", Number(analytics.quoteCount ?? 0)],
        ] : null;
        items = stats
            ? stats.map(([label, value]) => ({
                key: label,
                type: "label" as const,
                className: "justify-between px-4",
                label: (
                    <>
                        <span className="text-sm font-bold text-zinc-400">{label}</span>
                        <span className="text-sm font-black tabular-nums text-white">{value.toLocaleString()}</span>
                    </>
                ),
            }))
            : [{
                key: "loading",
                type: "label" as const,
                className: "justify-center px-4 text-sm font-medium text-zinc-400",
                label: "Loading…",
            }];
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
            menuItem(Info, "Content disclosure", () => setView("disclosure"), "default", false),
            menuItem(MessageCircle, "Change who can reply", () => setView("reply"), "default", false),
            menuItem(BarChart3, "View post analytics", () => setView("analytics"), "default", false),
            menuItem(embedCopied ? Check : Code, embedCopied ? "Copied embed code" : "Embed post", handleEmbedCopy, "default", false),
        ];
    } else {
        items = [
            menuItem(EyeOff, "Not interested in this post", handleNotInterested),
            menuItem(UserMinus, `Unfollow @${username || "user"}`),
            menuItem(UserPlus, `Subscribe to @${username || "user"}`),
            menuItem(ListPlus, "Add/remove from Lists"),
            menuItem(VolumeX, "Mute"),
            menuItem(Ban, `Block @${username || "user"}`),
            menuItem(embedCopied ? Check : Code, embedCopied ? "Copied embed code" : "Embed post", handleEmbedCopy, "default", false),
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
            fill={GOO_PANEL_FILL}
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
