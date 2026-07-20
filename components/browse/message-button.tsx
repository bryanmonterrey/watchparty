"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useCreateConversation } from "@/hooks/use-conversations";
import { MessagesIcon } from "@/components/icons";

interface MessageButtonProps {
    userId: string;
    className?: string;
}

/** Opens (or starts) a DM with this profile — was missing entirely before. */
export function MessageButton({ userId, className }: MessageButtonProps) {
    const { data: session } = useAuthSession();
    const router = useRouter();
    const { createConversation, isCreating } = useCreateConversation();
    const [pending, setPending] = useState(false);

    if (!session?.user || session.user.id === userId) return null;

    const handleClick = () => {
        setPending(true);
        createConversation(
            { participantIds: [userId], isGroup: false },
            {
                onSuccess: (data) => {
                    router.push(`/messages?c=${data.conversation.id}`);
                    setPending(false);
                },
                onError: (e) => {
                    toast.error(e.message || "Couldn't start a conversation");
                    setPending(false);
                },
            },
        );
    };

    return (
        <button
            onClick={handleClick}
            disabled={isCreating || pending}
            title="Message"
            className={className ?? "flex size-11 items-center justify-center rounded-full border border-flexborder/50 bg-black/25 text-white2 transition-colors hover:bg-white2/10 disabled:opacity-50"}
        >
            {pending || isCreating ? <Loader2 className="size-5 animate-spin" /> : <MessagesIcon className="size-5" />}
        </button>
    );
}
