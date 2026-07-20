"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { NoEntryIcon, ShieldOffIcon, VolumeOffIcon, VolumeOnIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

// ─── Block Button ─────────────────────────────────────────────────────────────

interface BlockButtonProps {
    userId: string;
    username?: string | null;
    className?: string;
    onDone?: () => void;
}

export function BlockButton({ userId, username, className, onDone }: BlockButtonProps) {
    const { data: session } = useAuthSession();
    const [showConfirm, setShowConfirm] = useState(false);
    const utils = trpc.useUtils();

    const { data: blockStatus } = trpc.moderation.isBlocked.useQuery(
        { userId },
        { enabled: !!session?.user && session.user.id !== userId }
    );

    const block = trpc.moderation.block.useMutation({
        onSuccess: () => {
            toast.success(`Blocked @${username}`);
            utils.moderation.isBlocked.invalidate({ userId });
            utils.moderation.getBlocked.invalidate();
            utils.user.followCounts.invalidate({ userId });
            setShowConfirm(false);
            onDone?.();
        },
        onError: (e) => toast.error(e.message),
    });

    const unblock = trpc.moderation.unblock.useMutation({
        onSuccess: () => {
            toast.success(`Unblocked @${username}`);
            utils.moderation.isBlocked.invalidate({ userId });
            utils.moderation.getBlocked.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    if (!session?.user || session.user.id === userId) return null;

    if (blockStatus?.blockedByMe) {
        return (
            <button
                onClick={() => unblock.mutate({ userId })}
                disabled={unblock.isPending}
                className={cn("flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors", className)}
            >
                {unblock.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOffIcon className="w-4 h-4" />}
                Unblock @{username}
            </button>
        );
    }

    return (
        <>
            <button
                onClick={() => setShowConfirm(true)}
                className={cn("flex items-center gap-2 text-sm text-red-400 hover:text-red-300 transition-colors", className)}
            >
                <NoEntryIcon className="w-4 h-4" />
                Block @{username}
            </button>

            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent className="sm:max-w-sm border border-white/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-zinc-100">
                            <NoEntryIcon className="w-4 h-4 text-red-400" /> Block @{username}?
                        </DialogTitle>
                    </DialogHeader>
                    <ul className="text-sm text-zinc-400 space-y-1.5 py-2">
                        <li>• They won't be able to find your profile or posts</li>
                        <li>• They won't be able to message you</li>
                        <li>• Any existing follows will be removed</li>
                        <li>• You won't see their content anywhere</li>
                    </ul>
                    <DialogFooter className="gap-2">
                        <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-full border border-white/10 text-sm text-zinc-300 hover:bg-white/5">
                            Cancel
                        </button>
                        <button
                            onClick={() => block.mutate({ userId })}
                            disabled={block.isPending}
                            className="px-4 py-2 rounded-full bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-60 flex items-center gap-1"
                        >
                            {block.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <NoEntryIcon className="w-3.5 h-3.5" />}
                            Block
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// ─── Mute Button ──────────────────────────────────────────────────────────────

interface MuteButtonProps {
    userId: string;
    username?: string | null;
    className?: string;
    onDone?: () => void;
}

export function MuteButton({ userId, username, className, onDone }: MuteButtonProps) {
    const { data: session } = useAuthSession();
    const [showOptions, setShowOptions] = useState(false);
    const [muteNotifs, setMuteNotifs] = useState(true);
    const [muteStories, setMuteStories] = useState(true);
    const utils = trpc.useUtils();

    const { data: muteStatus } = trpc.moderation.isMuted.useQuery(
        { userId },
        { enabled: !!session?.user && session.user.id !== userId }
    );

    const mute = trpc.moderation.mute.useMutation({
        onSuccess: () => {
            toast.success(`Muted @${username}`);
            utils.moderation.isMuted.invalidate({ userId });
            setShowOptions(false);
            onDone?.();
        },
        onError: (e) => toast.error(e.message),
    });

    const unmute = trpc.moderation.unmute.useMutation({
        onSuccess: () => {
            toast.success(`Unmuted @${username}`);
            utils.moderation.isMuted.invalidate({ userId });
        },
        onError: (e) => toast.error(e.message),
    });

    if (!session?.user || session.user.id === userId) return null;

    if (muteStatus?.muted) {
        return (
            <button
                onClick={() => unmute.mutate({ userId })}
                disabled={unmute.isPending}
                className={cn("flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors", className)}
            >
                {unmute.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <VolumeOnIcon className="w-4 h-4" />}
                Unmute @{username}
            </button>
        );
    }

    return (
        <>
            <button
                onClick={() => setShowOptions(true)}
                className={cn("flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors", className)}
            >
                <VolumeOffIcon className="w-4 h-4" />
                Mute @{username}
            </button>

            <Dialog open={showOptions} onOpenChange={setShowOptions}>
                <DialogContent className="sm:max-w-sm border border-white/10">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-zinc-100">
                            <VolumeOffIcon className="w-4 h-4" /> Mute @{username}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-500 pb-2">
                        Their posts won't appear in your feed. They won't know they're muted.
                    </p>
                    <div className="space-y-3 py-1">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-300">Mute notifications</span>
                            <Switch checked={muteNotifs} onCheckedChange={setMuteNotifs} />
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-300">Mute stories</span>
                            <Switch checked={muteStories} onCheckedChange={setMuteStories} />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 pt-2">
                        <button onClick={() => setShowOptions(false)} className="px-4 py-2 rounded-full border border-white/10 text-sm text-zinc-300 hover:bg-white/5">
                            Cancel
                        </button>
                        <button
                            onClick={() => mute.mutate({ userId, muteNotifications: muteNotifs, muteStories })}
                            disabled={mute.isPending}
                            className="px-4 py-2 rounded-full bg-white text-black text-sm font-bold hover:bg-white/90 disabled:opacity-60 flex items-center gap-1"
                        >
                            {mute.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            Mute
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
