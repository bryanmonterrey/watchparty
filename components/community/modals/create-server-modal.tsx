"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ImageUploadIcon, Mic01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { AvatarCropper, getCroppedDataUrl } from "@/components/file-upload/avatar-cropper";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Create server — two steps: identity (icon + name), then an optional
// channel template (Discord-style presets, always skippable via "Start
// fresh"). The server icon crops round through the shared pan/zoom cropper
// and uploads on create; templates seed channels on top of the default
// #general the server API already creates.

type TemplateChannel = { name: string; type: "TEXT" | "AUDIO" };
type Template = { id: string; label: string; desc: string; channels: TemplateChannel[] };

const TEMPLATES: Template[] = [
    { id: "fresh", label: "Start fresh", desc: "Just #general — build it your way", channels: [] },
    {
        id: "hangout", label: "Hangout", desc: "A place to chill with friends",
        channels: [{ name: "clips", type: "TEXT" }, { name: "memes", type: "TEXT" }, { name: "lounge", type: "AUDIO" }],
    },
    {
        id: "streamer", label: "Streamer community", desc: "Home base for your viewers",
        channels: [{ name: "announcements", type: "TEXT" }, { name: "stream-chat", type: "TEXT" }, { name: "clips", type: "TEXT" }, { name: "hangout", type: "AUDIO" }],
    },
    {
        id: "trading", label: "Trading crew", desc: "Charts, calls and alpha",
        channels: [{ name: "alpha", type: "TEXT" }, { name: "charts", type: "TEXT" }, { name: "calls", type: "TEXT" }, { name: "war-room", type: "AUDIO" }],
    },
];

const EASE = [0.23, 1, 0.32, 1] as const;

export function CreateServerModal() {
    const { isOpen, onClose, type } = useCommunityModal();
    const router = useRouter();
    const reduceMotion = !!useReducedMotion();
    const utils = trpc.useUtils();

    const [step, setStep] = useState<"identity" | "template">("identity");
    const [name, setName] = useState("");
    const [template, setTemplate] = useState("fresh");
    const [creating, setCreating] = useState(false);

    // Server icon: pick → round crop → data-url preview; uploaded on create.
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const createServer = trpc.community.createServer.useMutation();
    const createChannel = trpc.community.createChannel.useMutation();

    const isModalOpen = isOpen && type === "createServer";

    const reset = () => {
        setStep("identity");
        setName("");
        setTemplate("fresh");
        setIconDataUrl(null);
        setCropFile(null);
        cropStateRef.current = null;
        setCreating(false);
    };

    const handleClose = () => {
        if (creating) return;
        reset();
        onClose();
    };

    const applyCrop = async () => {
        const state = cropStateRef.current;
        if (!state) return;
        setIconDataUrl(await getCroppedDataUrl(state.src, state.area));
        setCropFile(null);
        cropStateRef.current = null;
    };

    const handleCreate = async () => {
        if (!name.trim() || creating) return;
        setCreating(true);
        try {
            // 1. upload the icon (if one was chosen)
            let imageUrl: string | undefined;
            if (iconDataUrl) {
                const blob = await (await fetch(iconDataUrl)).blob();
                const file = new File([blob], "server-icon.png", { type: "image/png" });
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "avatars",
                    filename: "server-icon.png",
                    contentType: "image/png",
                });
                const { data, error } = await supabase.storage.from("avatars").uploadToSignedUrl(path, token, file);
                if (!error && data) {
                    imageUrl = supabase.storage.from("avatars").getPublicUrl(data.path).data.publicUrl;
                }
            }

            // 2. create the server (API seeds #general)
            const server = await createServer.mutateAsync({ name: name.trim(), imageUrl });

            // 3. seed the chosen template's channels
            const channels = TEMPLATES.find((t) => t.id === template)?.channels ?? [];
            for (const ch of channels) {
                await createChannel.mutateAsync({ serverId: server.id, name: ch.name, type: ch.type });
            }

            utils.community.listServers.invalidate();
            reset();
            onClose();
            router.push(`/communities/${server.id}`);
        } catch (e) {
            console.error("Server creation failed:", e);
            setCreating(false);
        }
    };

    return (
        <>
            <Dialog open={isModalOpen} onOpenChange={handleClose}>
                <DialogContent className="overflow-hidden rounded-4xl border-none p-0 sm:max-w-[480px]" showCloseButton={false}>
                    <div className="flex h-[560px] max-h-[85svh] flex-col px-8 pb-8 pt-9">
                        <AnimatePresence mode="wait" initial={false}>
                            {step === "identity" && (
                                <motion.div
                                    key="identity"
                                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24, filter: "blur(4px)" }}
                                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24, filter: "blur(4px)" }}
                                    transition={{ duration: 0.28, ease: EASE }}
                                    className="flex min-h-0 flex-1 flex-col"
                                >
                                    <div className="text-center">
                                        <DialogTitle className="text-[24px] font-bold tracking-tight text-white">Create your server</DialogTitle>
                                        <p className="mt-1.5 text-[13px] font-medium text-zinc-500">
                                            Give it a face and a name — both can change later.
                                        </p>
                                    </div>

                                    {/* Icon picker — this is what shows in the server rail */}
                                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className={cn(
                                                "group relative grid size-24 cursor-pointer place-items-center overflow-hidden rounded-[28px] transition-colors",
                                                iconDataUrl ? "" : "border border-dashed border-white/15 hover:border-white/30",
                                            )}
                                        >
                                            {iconDataUrl ? (
                                                <>
                                                    <img src={iconDataUrl} alt="" className="size-full object-cover" />
                                                    <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <HugeiconsIcon icon={ImageUploadIcon} className="size-6 text-white" strokeWidth={2} />
                                                    </span>
                                                </>
                                            ) : (
                                                <HugeiconsIcon icon={ImageUploadIcon} className="size-7 text-zinc-600 transition-colors group-hover:text-zinc-300" strokeWidth={2} />
                                            )}
                                        </button>
                                        <p className="text-[12px] font-medium text-zinc-600">Server icon — shown in your server rail</p>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) setCropFile(f);
                                                e.target.value = "";
                                            }}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <Input
                                            radius={16}
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Server name"
                                            maxLength={100}
                                            autoFocus
                                            className="h-13 text-center text-[15px] font-semibold tracking-tight"
                                        />
                                        <button
                                            onClick={() => name.trim() && setStep("template")}
                                            disabled={!name.trim()}
                                            className="h-18 w-full cursor-pointer rounded-full bg-white text-[16px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                                        >
                                            Continue
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {step === "template" && (
                                <motion.div
                                    key="template"
                                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, filter: "blur(4px)" }}
                                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, filter: "blur(4px)" }}
                                    transition={{ duration: 0.28, ease: EASE }}
                                    className="flex min-h-0 flex-1 flex-col"
                                >
                                    <div className="relative text-center">
                                        <button
                                            onClick={() => setStep("identity")}
                                            aria-label="Back"
                                            className="absolute -left-2 top-0 grid size-9 cursor-pointer place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4.5" strokeWidth={2} />
                                        </button>
                                        <DialogTitle className="text-[24px] font-bold tracking-tight text-white">Start from a template</DialogTitle>
                                        <p className="mt-1.5 text-[13px] font-medium text-zinc-500">
                                            Pre-made channels for {name.trim() || "your server"} — you can edit everything after.
                                        </p>
                                    </div>

                                    <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto hidden-scrollbar">
                                        {TEMPLATES.map((t) => {
                                            const active = template === t.id;
                                            return (
                                                <Squircle asChild radius={18} key={t.id}>
                                                    <button
                                                        onClick={() => setTemplate(t.id)}
                                                        className={cn(
                                                            "cursor-pointer p-4 text-left transition-colors",
                                                            active ? "bg-white/[0.08]" : "bg-white/[0.03] hover:bg-white/[0.06]",
                                                        )}
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <p className={cn("text-[14px] font-bold", active ? "text-white" : "text-zinc-200")}>{t.label}</p>
                                                            {active && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-white" strokeWidth={2.5} />}
                                                        </div>
                                                        <p className="mt-0.5 text-[12px] font-medium text-zinc-500">{t.desc}</p>
                                                        <div className="mt-2 flex flex-wrap gap-1">
                                                            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-400"># general</span>
                                                            {t.channels.map((ch) => (
                                                                <span key={ch.name} className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-zinc-400">
                                                                    {ch.type === "AUDIO" ? <HugeiconsIcon icon={Mic01Icon} className="size-2.5" strokeWidth={2.5} /> : "#"} {ch.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </button>
                                                </Squircle>
                                            );
                                        })}
                                    </div>

                                    <button
                                        onClick={handleCreate}
                                        disabled={creating}
                                        className="mt-4 flex h-18 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-white text-[16px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                                    >
                                        {creating ? (
                                            <>
                                                <span className="size-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                                                Building your server…
                                            </>
                                        ) : `Create ${name.trim() || "server"}`}
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Icon crop (round, 512px) */}
            {cropFile && (
                <Dialog open onOpenChange={(o) => { if (!o) { setCropFile(null); cropStateRef.current = null; } }}>
                    <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
                        <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Adjust your icon</DialogTitle>
                        <AvatarCropper
                            file={cropFile}
                            onAreaChange={(src, area) => { cropStateRef.current = { src, area }; }}
                        />
                        <p className="text-center text-[12px] font-medium text-zinc-500">Drag to reposition · scroll or slide to zoom</p>
                        <div className="mt-1 flex gap-2">
                            <button
                                onClick={() => { setCropFile(null); cropStateRef.current = null; }}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={applyCrop}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90"
                            >
                                Save
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
