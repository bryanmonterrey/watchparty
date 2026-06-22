"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import {
    Flag, Pin, PinOff,
    UserMinus, UserPlus,
    VolumeX, Ban, EyeOff,
    BarChart3, Code, Megaphone, Trash2, Sparkles, Info, MessageCircle, ListPlus, X
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

// ── MenuItem ───────────────────────────────────────────────────────────────────

interface MenuItemProps {
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    variant?: "default" | "danger";
    className?: string;
}

function MenuItem({ icon: Icon, label, onClick, variant = "default", className }: MenuItemProps) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            className={cn(
                "flex items-center gap-3 w-full px-4 py-2.5 text-base font-bold transition-colors rounded-full cursor-pointer text-left group",
                variant === "danger"
                    ? "text-red-500 hover:bg-red-500/10"
                    : "text-zinc-200 hover:bg-white/5 hover:text-white",
                className
            )}
        >
            <Icon className={cn(
                "w-[18px] h-[18px] shrink-0 transition-colors",
                variant === "danger" ? "text-red-500" : "text-white group-hover:text-white"
            )} />
            <span className="truncate">{label}</span>
        </button>
    );
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
    trigger: React.ReactNode;
}

export function PostOptionsMenu({ 
    postId, userId, username, onClose, onHide, isOwnPost, isPinned, 
    open, onOpenChange, trigger 
}: PostOptionsMenuProps) {
    const [view, setView] = useState<"main" | "report">("main");
    const [reportSubmitted, setReportSubmitted] = useState(false);

    const submitReport = trpc.moderation.submitReport.useMutation();
    const pinPost = trpc.content.pinPost.useMutation({ onSuccess: onClose });
    const unpinPost = trpc.content.unpinPost.useMutation({ onSuccess: onClose });
    const notInterested = trpc.content.notInterested.useMutation();

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

    if (reportSubmitted) {
        return (
            <div className="px-4 py-6 text-sm text-zinc-300 text-center animate-in fade-in duration-200">
                Thanks for the report. We'll review it.
            </div>
        );
    }

    if (view === "report") {
        return (
            <div className="flex flex-col gap-0.5 animate-in slide-in-from-right-2 duration-200">
                <div className="flex items-center px-4 py-2 gap-3 border-b border-white/5 mb-1">
                    <button onClick={() => setView("main")} className="p-1 -ml-1 text-zinc-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-bold text-white">Report post</span>
                </div>
                {REPORT_REASONS.map(reason => (
                    <MenuItem
                        key={reason}
                        icon={Flag}
                        label={reason}
                        onClick={() => handleReport(reason)}
                    />
                ))}
            </div>
        );
    }

    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                {trigger}
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="end"
                sideOffset={8}
                className="w-72 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50 transition-all duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                    {isOwnPost ? (
                        <>
                            <MenuItem icon={Trash2} label="Delete" variant="danger" onClick={() => { }} />
                            <MenuItem
                                icon={isPinned ? PinOff : Pin}
                                label={isPinned ? "Unpin from profile" : "Pin to your profile"}
                                onClick={() => isPinned ? unpinPost.mutate({ postId }) : pinPost.mutate({ postId })}
                            />
                            <MenuItem icon={Sparkles} label="Add/remove from Highlights" />
                            <MenuItem icon={ListPlus} label="Add/remove from Lists" />
                            <MenuItem icon={Info} label="Add/remove content disclosure" />
                            <MenuItem icon={MessageCircle} label="Change who can reply" />
                            <MenuItem icon={BarChart3} label="View post activity" />
                            <MenuItem icon={Code} label="Embed post" />
                            <MenuItem icon={BarChart3} label="View post analytics" />
                            <MenuItem icon={Megaphone} label="Request Community Note" />
                        </>
                    ) : (
                        <>
                            <MenuItem icon={EyeOff} label="Not interested in this post" onClick={handleNotInterested} />
                            <MenuItem icon={UserMinus} label={`Unfollow @${username || "user"}`} />
                            <MenuItem icon={UserPlus} label={`Subscribe to @${username || "user"}`} />
                            <MenuItem icon={ListPlus} label="Add/remove from Lists" />
                            <MenuItem icon={VolumeX} label="Mute" />
                            <MenuItem icon={Ban} label={`Block @${username || "user"}`} />
                            <MenuItem icon={BarChart3} label="View post activity" />
                            <MenuItem icon={Code} label="Embed post" />
                            <MenuItem icon={Flag} label="Report post" onClick={() => setView("report")} />
                            <MenuItem icon={Megaphone} label="Request Community Note" />
                        </>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
