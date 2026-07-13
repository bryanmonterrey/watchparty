"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

export function WelcomeMessageSettings() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const utils = trpc.useUtils();

    const { data } = trpc.creator.getWelcomeMessage.useQuery(undefined, { enabled: !!userId });
    const [enabled, setEnabled] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (data) {
            setEnabled(data.enabled);
            setMessage(data.message ?? "");
        }
    }, [data]);

    const save = trpc.creator.setWelcomeMessage.useMutation({
        onSuccess: () => { toast.success("Welcome message saved"); utils.creator.getWelcomeMessage.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <MessageSquarePlus className="w-5 h-5 text-white" />
                <h2 className="text-base font-bold text-zinc-100">Welcome Message</h2>
            </div>

            <div className="rounded-[20px] bg-panel p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm font-medium text-zinc-200">Auto-send on new follow</p>
                        <p className="text-xs text-zinc-500">Automatically DM new followers</p>
                    </div>
                    <button
                        onClick={() => setEnabled(v => !v)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-white" : "bg-zinc-700"}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${enabled ? "translate-x-5 bg-black" : "translate-x-0 bg-white"}`} />
                    </button>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Message</label>
                    <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Hey! Thanks for following — feel free to DM me anytime 👋"
                        rows={4}
                        maxLength={500}
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                    <p className="text-right text-xs text-zinc-600">{message.length}/500</p>
                </div>

                <button
                    onClick={() => save.mutate({ enabled, message })}
                    disabled={save.isPending}
                    className="w-full py-2 rounded-lg bg-white text-zinc-950 font-bold text-sm hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                    {save.isPending ? "Saving…" : "Save"}
                </button>
            </div>
        </div>
    );
}
