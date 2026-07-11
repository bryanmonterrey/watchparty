"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Radio, Copy, Eye, EyeOff, RefreshCw, AlertTriangle, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { GooDropdown } from "@/components/ui/goo-dropdown";

function CopyField({ label, value, secret }: { label: string; value: string | null; secret?: boolean }) {
    const [show, setShow] = useState(!secret);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-xl bg-zinc-800/60 p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">{label}</p>
            <div className="flex items-center gap-2">
                <input
                    type={secret && !show ? "password" : "text"}
                    value={value ?? ""}
                    readOnly
                    placeholder={value ? "" : "Not generated yet"}
                    className="flex-1 bg-zinc-900 text-sm text-zinc-200 px-3 py-2 rounded-lg border border-white/10 focus:outline-none "
                />
                {secret && (
                    <button onClick={() => setShow(v => !v)} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                )}
                <button onClick={copy} disabled={!value} className="p-2 text-zinc-500 hover:text-white transition-colors disabled:opacity-30">
                    {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}

function GenerateModal({ onGenerated }: { onGenerated: () => void }) {
    const [open, setOpen] = useState(false);
    const [ingressType, setIngressType] = useState<"RTMP" | "WHIP">("RTMP");

    const generate = trpc.stream.generateConnection.useMutation({
        onSuccess: () => {
            toast.success("Stream connection generated");
            onGenerated();
            setOpen(false);
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-full bg-white text-zinc-950 text-sm font-bold hover:bg-white/90 transition-colors">
                    <RefreshCw className="w-4 h-4" /> Generate Connection
                </button>
            </DialogTrigger>
            <DialogContent className="border-white/10 max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-zinc-100">Generate Stream Connection</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <label className="text-xs text-zinc-400">Connection type</label>
                        <GooDropdown
                            className="w-full"
                            align="start"
                            width={280}
                            gap={8}
                            fill="#27272a"
                            buttonRadius={8}
                            panelRadius={12}
                            triggerClassName="flex h-9 w-full items-center justify-between rounded-md border border-white/10 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                            trigger={
                                <>
                                    {ingressType === "RTMP" ? "RTMP (OBS, Streamlabs)" : "WHIP (Browser-based)"}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </>
                            }
                            items={([
                                { value: "RTMP", label: "RTMP (OBS, Streamlabs)" },
                                { value: "WHIP", label: "WHIP (Browser-based)" },
                            ] as const).map((opt) => ({
                                key: opt.value,
                                onClick: () => setIngressType(opt.value),
                                className: "justify-between text-zinc-100 hover:bg-white/10",
                                label: (
                                    <>
                                        {opt.label}
                                        {ingressType === opt.value && <Check className="h-4 w-4" />}
                                    </>
                                ),
                            }))}
                        />
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">This will reset your existing stream key and server URL. Any active stream will be interrupted.</p>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:bg-white/5 transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={() => generate.mutate({ ingressType })}
                            disabled={generate.isPending}
                            className="px-4 py-2 rounded-lg bg-white text-zinc-950 text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
                        >
                            {generate.isPending ? "Generating…" : "Generate"}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function StreamSettings() {
    const utils = trpc.useUtils();
    const { data: stream, isLoading } = trpc.stream.getMine.useQuery();

    const updateInfo = trpc.stream.updateInfo.useMutation({
        onSuccess: () => { toast.success("Saved"); utils.stream.getMine.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const [title, setTitle] = useState(stream?.title ?? "");
    const [category, setCategory] = useState(stream?.category ?? "");

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Radio className="w-5 h-5 text-red-500" />
                    <h2 className="text-base font-bold text-zinc-100">Stream Settings</h2>
                    {stream?.isLive && (
                        <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-red-600 text-white uppercase tracking-wide">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            Live
                        </span>
                    )}
                </div>
                <GenerateModal onGenerated={() => utils.stream.getMine.invalidate()} />
            </div>

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            ) : !stream ? (
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-8 text-center space-y-2">
                    <Radio className="w-10 h-10 mx-auto text-zinc-700" />
                    <p className="text-sm text-zinc-400">No stream connection yet.</p>
                    <p className="text-xs text-zinc-600">Click "Generate Connection" to create your RTMP/WHIP stream key.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <CopyField label="Server URL" value={stream.serverUrl} />
                    <CopyField label="Stream Key" value={stream.streamKey} secret />
                    <CopyField label="Playback URL" value={stream.playbackUrl} />
                </div>
            )}

            {/* Stream info */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Stream Info</p>
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-500">Title</label>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="What are you streaming today?"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs text-zinc-500">Category</label>
                    <input
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        placeholder="e.g. Gaming, Music, Crypto…"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                </div>
                <button
                    onClick={() => updateInfo.mutate({ title: title || undefined, category: category || undefined })}
                    disabled={updateInfo.isPending}
                    className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-zinc-200 font-medium transition-colors disabled:opacity-50"
                >
                    {updateInfo.isPending ? "Saving…" : "Save Info"}
                </button>
            </div>

            {/* Setup instructions */}
            <div className="rounded-xl bg-zinc-900/40 border border-white/5 p-4 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">OBS Setup</p>
                <ol className="text-xs text-zinc-500 space-y-1 list-decimal list-inside">
                    <li>Open OBS → Settings → Stream</li>
                    <li>Set Service to "Custom…"</li>
                    <li>Paste your Server URL into "Server"</li>
                    <li>Paste your Stream Key into "Stream Key"</li>
                    <li>Click OK and start streaming</li>
                </ol>
            </div>
        </div>
    );
}
