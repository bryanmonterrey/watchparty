"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Copy01Icon,
    LiveStreaming02Icon,
    RefreshIcon,
    Tick02Icon,
    ViewIcon,
    ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { appToast } from "@/components/app-ui/app-toast";

// The Create dialog's Stream tab: generate a stream connection, grab your
// credentials, set the stream info, go live from OBS. Ceremonial first-run
// (the upgrade-overlay language), utilitarian once connected. Flat fills +
// uniform inner hairlines only — no gradients, no gray shadows.

type Protocol = "RTMP" | "WHIP";

const PROTOCOLS: { key: Protocol; label: string; hint: string }[] = [
    { key: "RTMP", label: "RTMP", hint: "OBS, Streamlabs & most encoders" },
    { key: "WHIP", label: "WHIP", hint: "Browser encoders, ultra-low latency" },
];

export function StreamSetup() {
    const utils = trpc.useUtils();
    const { data: stream, isLoading } = trpc.stream.getMine.useQuery();

    const generate = trpc.stream.generateConnection.useMutation({
        onSuccess: () => {
            utils.stream.getMine.invalidate();
            appToast.success("Stream connection ready");
        },
        onError: (e) => appToast.error(e.message),
    });

    if (isLoading) {
        return (
            <div className="flex h-[420px] items-center justify-center">
                <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
            </div>
        );
    }

    return stream?.streamKey ? (
        <Connected stream={stream} onSwitchProtocol={(p) => generate.mutate({ ingressType: p })} switching={generate.isPending} />
    ) : (
        <FirstRun onGenerate={(p) => generate.mutate({ ingressType: p })} generating={generate.isPending} />
    );
}

// ─── First run: no connection yet ───────────────────────────

function FirstRun({ onGenerate, generating }: { onGenerate: (p: Protocol) => void; generating: boolean }) {
    const [protocol, setProtocol] = useState<Protocol>("RTMP");
    const active = PROTOCOLS.find((p) => p.key === protocol)!;

    return (
        <div className="mx-auto flex min-h-[420px] max-w-sm flex-col items-center justify-center px-2 py-10 text-center">
            <div className="grid size-16 place-items-center rounded-full bg-pastelred/10">
                <HugeiconsIcon icon={LiveStreaming02Icon} className="size-8 text-pastelred" strokeWidth={1.8} />
            </div>

            <h2 className="mt-5 text-[26px] font-black tracking-tight text-white">Go live on watchparty</h2>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-zinc-500">
                Generate your stream connection once, then stream from OBS or any encoder — whenever you want.
            </p>

            {/* Protocol choice — segmented pill, white puck marks the active side */}
            <div className="mt-7 inline-flex rounded-full bg-white/[0.06] p-1">
                {PROTOCOLS.map((p) => (
                    <button
                        key={p.key}
                        onClick={() => setProtocol(p.key)}
                        className={cn(
                            "cursor-pointer rounded-full px-6 py-2 text-[14px] font-bold transition-colors",
                            protocol === p.key ? "bg-white text-black" : "text-zinc-400 hover:text-white",
                        )}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
            <p className="mt-2 text-[12px] font-semibold text-zinc-600">{active.hint}</p>

            <button
                onClick={() => onGenerate(protocol)}
                disabled={generating}
                className="mt-7 h-12 w-full cursor-pointer rounded-full bg-white text-[15px] font-extrabold text-black transition-colors hover:bg-white/90 disabled:opacity-50"
            >
                {generating ? "Setting up your channel…" : "Generate stream connection"}
            </button>
            <p className="mt-3 text-[12px] font-medium text-zinc-600">
                Free · takes a few seconds · your key stays private
            </p>
        </div>
    );
}

// ─── Connected: credentials + stream info ───────────────────

function Connected({
    stream,
    onSwitchProtocol,
    switching,
}: {
    stream: {
        serverUrl: string | null;
        streamKey: string | null;
        playbackUrl: string | null;
        isLive: boolean | null;
        title: string | null;
        category: string | null;
    };
    onSwitchProtocol: (p: Protocol) => void;
    switching: boolean;
}) {
    const utils = trpc.useUtils();
    // null = untouched (mirror the server value); string = user is editing
    const [titleDraft, setTitleDraft] = useState<string | null>(null);
    const [categoryDraft, setCategoryDraft] = useState<string | null>(null);
    const title = titleDraft ?? stream.title ?? "";
    const category = categoryDraft ?? stream.category ?? "";
    const dirty = title !== (stream.title ?? "") || category !== (stream.category ?? "");

    const updateInfo = trpc.stream.updateInfo.useMutation({
        onSuccess: () => {
            utils.stream.getMine.invalidate();
            setTitleDraft(null);
            setCategoryDraft(null);
            appToast.success("Stream info saved");
        },
        onError: (e) => appToast.error(e.message),
    });

    const protocol: Protocol = stream.serverUrl?.startsWith("https") ? "WHIP" : "RTMP";
    const other: Protocol = protocol === "RTMP" ? "WHIP" : "RTMP";

    return (
        <div className="space-y-4 px-1 pb-2">
            {/* Header */}
            <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2.5">
                    <h2 className="text-[19px] font-black tracking-tight text-white">Your stream</h2>
                    {stream.isLive ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-pastelred/15 px-2.5 py-1 text-[11px] font-bold tracking-wide text-pastelred">
                            <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                            LIVE
                        </span>
                    ) : (
                        <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold tracking-wide text-zinc-500">
                            OFFLINE
                        </span>
                    )}
                </div>
                <button
                    onClick={() => onSwitchProtocol(other)}
                    disabled={switching}
                    title={`Switch the ingest to ${other}`}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-[12px] font-bold text-zinc-400 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                    <HugeiconsIcon icon={RefreshIcon} className={cn("size-3.5", switching && "animate-spin")} strokeWidth={2.5} />
                    {protocol} · switch to {other}
                </button>
            </div>

            {/* Credentials */}
            <div className="divide-y divide-white/[0.06] rounded-3xl bg-white/[0.03] ring-1 ring-white/10">
                <CredentialRow label="Server URL" value={stream.serverUrl} />
                <CredentialRow label="Stream key" value={stream.streamKey} secret />
                <CredentialRow label="Playback URL" value={stream.playbackUrl} />
            </div>

            {/* Stream info */}
            <div className="space-y-3 rounded-3xl bg-white/[0.03] p-5 ring-1 ring-white/10">
                <p className="text-[14px] font-bold text-white">Stream info</p>
                <Input
                    radius={14}
                    value={title}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="What are you streaming today?"
                    maxLength={100}
                    className="h-11 bg-white/[0.04] text-[14px] font-medium"
                />
                <div className="flex items-center gap-2">
                    <Input
                        radius={14}
                        value={category}
                        onChange={(e) => setCategoryDraft(e.target.value)}
                        placeholder="Category — Gaming, Music, Crypto…"
                        maxLength={50}
                        className="h-11 flex-1 bg-white/[0.04] text-[14px] font-medium"
                    />
                    <button
                        onClick={() => updateInfo.mutate({ title: title || undefined, category: category || undefined })}
                        disabled={updateInfo.isPending || !dirty}
                        className="h-11 shrink-0 cursor-pointer rounded-full bg-white px-5 text-[14px] font-extrabold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                    >
                        {updateInfo.isPending ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>

            {/* How to go live */}
            <div className="rounded-3xl bg-white/[0.03] p-5 ring-1 ring-white/10">
                <p className="text-[14px] font-bold text-white">Go live in OBS</p>
                <div className="mt-3 space-y-2.5">
                    {[
                        "Settings → Stream → set Service to “Custom…”",
                        "Paste the Server URL and Stream key above",
                        "Start Streaming — your channel flips live automatically",
                    ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                            <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-black text-zinc-400">
                                {i + 1}
                            </span>
                            <p className="text-[13px] font-medium leading-snug text-zinc-500">{step}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CredentialRow({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
    const [show, setShow] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-3 px-5 py-3.5">
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">{label}</p>
                <p className={cn("truncate font-mono text-[13px] font-medium", value ? "text-zinc-300" : "text-zinc-600")}>
                    {value ? (secret && !show ? "•".repeat(28) : value) : "Not generated yet"}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
                {secret && value && (
                    <button
                        onClick={() => setShow((v) => !v)}
                        aria-label={show ? `Hide ${label}` : `Reveal ${label}`}
                        className="grid size-9 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
                    >
                        <HugeiconsIcon icon={show ? ViewOffSlashIcon : ViewIcon} className="size-4" strokeWidth={2} />
                    </button>
                )}
                <button
                    onClick={copy}
                    disabled={!value}
                    aria-label={`Copy ${label}`}
                    className="grid size-9 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className={cn("size-4", copied && "text-lantern")} strokeWidth={2} />
                </button>
            </div>
        </div>
    );
}
