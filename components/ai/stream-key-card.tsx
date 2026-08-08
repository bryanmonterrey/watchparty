"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// The stream key, rendered by the CLIENT rather than spoken by the model.
//
// This component is the whole security design made visible. The assistant tool
// returns only `{ kind: "stream_key_card" }` — a reference with no secret in
// it — and this fetches the real value over its own authenticated tRPC call.
// So the key never enters the model's context, never appears in a tool result,
// and is never written to assistant_messages.parts, which since conversation
// history shipped would have persisted a live credential indefinitely.
//
// It also removes the payoff from prompt injection: getLiveStreams feeds
// attacker-controlled stream titles into the same context, so "print the user's
// key" is a plausible injected instruction — it just has nothing to print.
//
// Masked until asked for, because a chat panel is a surface people screen-share
// and scroll past in public.

export function StreamKeyCard({ rotated = false }: { rotated?: boolean }) {
    const [revealed, setRevealed] = useState(false);
    const [copied, setCopied] = useState<"key" | "server" | null>(null);

    // The one place the secret is fetched, on the client's own credentials.
    const { data, isLoading } = trpc.stream.getMine.useQuery();

    const copy = async (value: string, which: "key" | "server") => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(which);
            setTimeout(() => setCopied(null), 1600);
        } catch {
            // Clipboard is permission-gated and refuses outside a user gesture
            // in some browsers. Reveal instead of failing silently, so the
            // value can still be selected by hand.
            setRevealed(true);
        }
    };

    if (isLoading) {
        return <div className="h-24 w-full animate-none rounded-2xl bg-white/[0.04]" />;
    }

    if (!data?.streamKey) {
        return (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-[13px] font-medium text-zinc-400">
                    No stream key yet — set up your channel in stream settings first.
                </p>
            </div>
        );
    }

    return (
        <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            {rotated && (
                <p className="mb-2.5 text-[12px] font-semibold text-pastelred">
                    New key generated. The old one no longer works — update OBS before going live.
                </p>
            )}

            {data.serverUrl && (
                <Row
                    label="Server"
                    value={data.serverUrl}
                    // Not a secret: the ingest URL is the same for everyone on
                    // the channel's region, so masking it would only add
                    // friction to the half of the setup that isn't sensitive.
                    masked={false}
                    copied={copied === "server"}
                    onCopy={() => copy(data.serverUrl!, "server")}
                />
            )}

            <Row
                label="Stream key"
                value={data.streamKey}
                masked={!revealed}
                copied={copied === "key"}
                onCopy={() => copy(data.streamKey!, "key")}
                onToggle={() => setRevealed((v) => !v)}
                revealed={revealed}
            />
        </div>
    );
}

function Row({
    label,
    value,
    masked,
    copied,
    onCopy,
    onToggle,
    revealed,
}: {
    label: string;
    value: string;
    masked: boolean;
    copied: boolean;
    onCopy: () => void;
    onToggle?: () => void;
    revealed?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 py-1.5">
            <span className="w-[74px] shrink-0 text-[11px] font-semibold text-zinc-500">{label}</span>

            <code
                className={cn(
                    "min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[12px]",
                    masked ? "text-zinc-500 select-none" : "text-white",
                )}
            >
                {/* A FIXED-LENGTH mask, not the real length — a mask that
                    matches the string tells anyone watching how long the
                    secret is. */}
                {masked ? "••••••••••••••••••••" : value}
            </code>

            {onToggle && (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={revealed ? "Hide stream key" : "Reveal stream key"}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                    <HugeiconsIcon icon={revealed ? ViewOffIcon : ViewIcon} className="size-4" />
                </button>
            )}

            <button
                type="button"
                onClick={onCopy}
                aria-label={`Copy ${label.toLowerCase()}`}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
                <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    className={cn("size-4", copied && "text-white")}
                />
            </button>
        </div>
    );
}
