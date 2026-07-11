"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Send, Users } from "lucide-react";
import { toast } from "sonner";

type Audience = "all_followers" | "vips";

export function MassMessageComposer() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const [audience, setAudience] = useState<Audience>("all_followers");
    const [content, setContent] = useState("");
    const utils = trpc.useUtils();

    const { data: vips } = trpc.creator.getVIPs.useQuery({ creatorId: userId }, { enabled: !!userId });

    const send = trpc.creator.sendMassMessage.useMutation({
        onSuccess: (data) => {
            toast.success(`Message sent to ${data.recipientCount} users`);
            setContent("");
            utils.creator.getMassMessages.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    const { data: history, isLoading: historyLoading } = trpc.creator.getMassMessages.useQuery(undefined, { enabled: !!userId });

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-white" />
                <h2 className="text-base font-bold text-zinc-100">Mass Message</h2>
            </div>

            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                {/* Audience selector */}
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Send to</label>
                    <div className="flex gap-2">
                        {(["all_followers", "vips"] as const).map(a => (
                            <button
                                key={a}
                                onClick={() => setAudience(a)}
                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${audience === a ? "bg-white text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
                            >
                                {a === "all_followers" ? "All Followers" : `VIPs (${vips?.length ?? 0})`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Message</label>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="Write a message to your followers…"
                        rows={4}
                        maxLength={1000}
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                    <p className="text-right text-xs text-zinc-600">{content.length}/1000</p>
                </div>

                <button
                    onClick={() => send.mutate({ audience, content })}
                    disabled={send.isPending || content.trim().length === 0}
                    className="w-full py-2 rounded-lg bg-white text-zinc-950 font-bold text-sm hover:bg-white/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    <Send className="w-4 h-4" />
                    {send.isPending ? "Sending…" : "Send Message"}
                </button>
            </div>

            {/* History */}
            {(history?.length ?? 0) > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Previous</p>
                    {historyLoading ? null : history?.map(m => (
                        <div key={m.id} className="rounded-lg bg-zinc-900/40 border border-white/5 p-3 space-y-1">
                            <div className="flex items-center gap-2 justify-between">
                                <span className="text-xs text-zinc-500 flex items-center gap-1">
                                    <Users className="w-3 h-3" /> {m.recipientCount} recipients · {m.audience === "vips" ? "VIPs" : "All followers"}
                                </span>
                                <span className="text-xs text-zinc-600">{new Date(m.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-zinc-300 line-clamp-2">{m.content}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
