"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

// Per-server profile (the Discord "Edit Per-server Profile"): a nickname
// that replaces your display name only inside this server.
export function NicknameModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const utils = trpc.useUtils();
    const [nickname, setNickname] = useState("");

    const isModalOpen = isOpen && type === "nickname";
    const serverId = data.server?.id;

    const { data: serverData } = trpc.community.getServer.useQuery(
        { serverId: serverId! },
        { enabled: isModalOpen && !!serverId },
    );

    // Render-time seed (react-hooks/set-state-in-effect).
    const [seededFor, setSeededFor] = useState<string | null>(null);
    if (isModalOpen && serverId && serverData && seededFor !== serverId) {
        setSeededFor(serverId);
        setNickname(serverData.currentMember.nickname ?? "");
    }
    if (!isModalOpen && seededFor !== null) setSeededFor(null);

    const setNick = trpc.community.setNickname.useMutation({
        onSuccess: () => {
            if (serverId) utils.community.getServer.invalidate({ serverId });
            utils.community.getMessages.invalidate();
            onClose();
        },
    });

    const save = (value: string | null) => {
        if (!serverId) return;
        setNick.mutate({ serverId, nickname: value });
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="gap-5 rounded-4xl border-none p-6 sm:max-w-[420px]" showCloseButton={false}>
                <div className="text-center">
                    <DialogTitle className="text-[18px] font-bold tracking-tight text-white">Server profile</DialogTitle>
                    <p className="mt-1 text-[13px] font-medium text-zinc-500">
                        Pick a nickname just for {data.server?.name ?? "this server"}.
                    </p>
                </div>

                <Input
                    radius={14}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={serverData?.currentMember.nickname ? "Nickname" : "Your name stays the default"}
                    maxLength={50}
                    autoFocus
                    className="h-12 text-center text-[14px] font-semibold"
                />

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => save(null)}
                        disabled={setNick.isPending || !serverData?.currentMember.nickname}
                        className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={() => save(nickname)}
                        disabled={setNick.isPending || !nickname.trim()}
                        className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                        {setNick.isPending ? "Saving…" : "Save"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
