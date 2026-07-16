"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";

// Replaces the chat input for members who haven't agreed to the server rules
// yet (Access → Server rules). Mods/admins are exempt, matching the server.
export function CommunityRulesGate({ serverId, rules }: { serverId: string; rules: string }) {
    const utils = trpc.useUtils();
    const agree = trpc.community.agreeToRules.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId }),
        onError: (err) => toast.error(err.message),
    });

    const lines = rules.split("\n").map((l) => l.trim()).filter(Boolean);

    return (
        <div className="mx-4 mb-4 shrink-0 rounded-3xl bg-white/[0.04] p-5">
            <p className="text-[15px] font-bold text-white">Agree to the rules to chat</p>
            <ul className="mt-2 space-y-1">
                {lines.map((line, i) => (
                    <li key={i} className="flex gap-2 text-[13px] font-medium leading-relaxed text-zinc-400">
                        <span className="shrink-0 font-bold tabular-nums text-zinc-600">{i + 1}.</span>
                        {line}
                    </li>
                ))}
            </ul>
            <button
                onClick={() => agree.mutate({ serverId })}
                disabled={agree.isPending}
                className="mt-4 h-11 w-full cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
                {agree.isPending ? "One sec…" : "I agree"}
            </button>
        </div>
    );
}
