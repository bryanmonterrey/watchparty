"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Alert02Icon,
    ArrowDown01Icon,
    Copy01Icon,
    RefreshIcon,
    Tick02Icon,
    ViewIcon,
    ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { EmptyState, FieldLabel, Panel, PanelHeader, PanelSkeleton, PillButton } from "@/components/settings/ui";

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
        <Panel className="space-y-2 p-4">
            <p className="text-[12px] font-medium text-zinc-500">{label}</p>
            <div className="flex items-center gap-1.5">
                <Input
                    radius={12}
                    type={secret && !show ? "password" : "text"}
                    value={value ?? ""}
                    readOnly
                    placeholder={value ? "" : "Not generated yet"}
                    className="h-10 bg-white/[0.04] text-[13px] text-zinc-200"
                />
                {secret && (
                    <button onClick={() => setShow(v => !v)} className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                        <HugeiconsIcon icon={show ? ViewOffSlashIcon : ViewIcon} className="size-4" strokeWidth={2} />
                    </button>
                )}
                <button onClick={copy} disabled={!value} className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30">
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className={cn("size-4", copied && "text-white")} strokeWidth={2} />
                </button>
            </div>
        </Panel>
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
                <PillButton variant="primary">
                    <HugeiconsIcon icon={RefreshIcon} className="size-4" strokeWidth={2} /> Generate connection
                </PillButton>
            </DialogTrigger>
            <DialogContent className="max-w-md border-white/5">
                <DialogHeader>
                    <DialogTitle className="text-white">Generate stream connection</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <FieldLabel>Connection type</FieldLabel>
                        <GooDropdown
                            className="w-full"
                            align="start"
                            width={280}
                            gap={8}
                            fill="#27272a"
                            buttonRadius={20}
                            panelRadius={16}
                            triggerClassName="flex h-10 w-full items-center justify-between rounded-full bg-white/5 px-4 text-[13px] font-semibold text-white"
                            trigger={
                                <>
                                    {ingressType === "RTMP" ? "RTMP (OBS, Streamlabs)" : "WHIP (Browser-based)"}
                                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-zinc-500" strokeWidth={2} />
                                </>
                            }
                            items={([
                                { value: "RTMP", label: "RTMP (OBS, Streamlabs)" },
                                { value: "WHIP", label: "WHIP (Browser-based)" },
                            ] as const).map((opt) => ({
                                key: opt.value,
                                onClick: () => setIngressType(opt.value),
                                className: "justify-between text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                label: (
                                    <>
                                        {opt.label}
                                        {ingressType === opt.value && <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={2} />}
                                    </>
                                ),
                            }))}
                        />
                    </div>

                    <Squircle asChild radius={14} autoEffects={false}>
                        <div className="flex items-start gap-2 bg-sunset/10 p-3">
                            <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-sunset" strokeWidth={2} />
                            <p className="text-[12px] font-medium text-sunset">This will reset your existing stream key and server URL. Any active stream will be interrupted.</p>
                        </div>
                    </Squircle>

                    <div className="flex justify-end gap-2">
                        <button onClick={() => setOpen(false)} className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-400 transition-colors hover:bg-white/5 hover:text-white">
                            Cancel
                        </button>
                        <PillButton variant="primary" onClick={() => generate.mutate({ ingressType })} disabled={generate.isPending}>
                            {generate.isPending ? "Generating…" : "Generate"}
                        </PillButton>
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
        <div className="space-y-4">
            <PanelHeader
                title="Stream"
                badge={stream?.isLive && (
                    <span className="flex items-center gap-1 rounded-full bg-pastelred/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-pastelred">
                        <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                        LIVE
                    </span>
                )}
                action={<GenerateModal onGenerated={() => utils.stream.getMine.invalidate()} />}
            />

            {isLoading ? (
                <PanelSkeleton rows={3} rowClassName="h-20" />
            ) : !stream ? (
                <EmptyState title="No stream connection yet" hint="Generate a connection to get your server URL and stream key" />
            ) : (
                <div className="space-y-3">
                    <CopyField label="Server URL" value={stream.serverUrl} />
                    <CopyField label="Stream key" value={stream.streamKey} secret />
                    <CopyField label="Playback URL" value={stream.playbackUrl} />
                </div>
            )}

            {/* Stream info */}
            <Panel className="space-y-4 p-5">
                <p className="text-[14px] font-semibold text-zinc-300">Stream info</p>
                <div className="space-y-1.5">
                    <FieldLabel>Title</FieldLabel>
                    <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="What are you streaming today?"
                        className="h-11 text-[13px]"
                    />
                </div>
                <div className="space-y-1.5">
                    <FieldLabel>Category</FieldLabel>
                    <Input
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                        placeholder="e.g. Gaming, Music, Crypto…"
                        className="h-11 text-[13px]"
                    />
                </div>
                <PillButton
                    className="w-full"
                    onClick={() => updateInfo.mutate({ title: title || undefined, category: category || undefined })}
                    disabled={updateInfo.isPending}
                >
                    {updateInfo.isPending ? "Saving…" : "Save info"}
                </PillButton>
            </Panel>

            {/* Setup instructions */}
            <Panel className="space-y-2 p-5">
                <p className="text-[12px] font-medium text-zinc-500">OBS setup</p>
                <ol className="list-inside list-decimal space-y-1 text-[13px] text-zinc-500">
                    <li>Open OBS → Settings → Stream</li>
                    <li>Set Service to "Custom…"</li>
                    <li>Paste your Server URL into "Server"</li>
                    <li>Paste your Stream Key into "Stream Key"</li>
                    <li>Click OK and start streaming</li>
                </ol>
            </Panel>
        </div>
    );
}
