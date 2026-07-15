"use client";

import { useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import { ImageUploadIcon } from "@hugeicons/core-free-icons";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AvatarCropper, getCroppedDataUrl } from "@/components/file-upload/avatar-cropper";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Edit server — same identity surface as create step 1 (icon + name),
// prefilled; icon re-crops through the shared pan/zoom cropper.
export function EditServerModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const utils = trpc.useUtils();

    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateServer = trpc.community.updateServer.useMutation();

    const isModalOpen = isOpen && type === "editServer";
    const server = data.server;

    // Seed the form when the modal opens for a server — render-time
    // adjustment instead of an effect (react-hooks/set-state-in-effect).
    const [seededFor, setSeededFor] = useState<string | null>(null);
    if (isModalOpen && server && seededFor !== server.id) {
        setSeededFor(server.id);
        setName(server.name);
        setIconDataUrl(null);
    }
    if (!isModalOpen && seededFor !== null) setSeededFor(null);

    const previewSrc = iconDataUrl ?? server?.imageUrl ?? null;

    const handleClose = () => {
        if (saving) return;
        setCropFile(null);
        cropStateRef.current = null;
        onClose();
    };

    const applyCrop = async () => {
        const state = cropStateRef.current;
        if (!state) return;
        setIconDataUrl(await getCroppedDataUrl(state.src, state.area));
        setCropFile(null);
        cropStateRef.current = null;
    };

    const handleSave = async () => {
        if (!server?.id || !name.trim() || saving) return;
        setSaving(true);
        try {
            let imageUrl: string | undefined;
            if (iconDataUrl) {
                const blob = await (await fetch(iconDataUrl)).blob();
                const file = new File([blob], "server-icon.png", { type: "image/png" });
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "avatars",
                    filename: "server-icon.png",
                    contentType: "image/png",
                });
                const { data: up, error } = await supabase.storage.from("avatars").uploadToSignedUrl(path, token, file);
                if (!error && up) {
                    imageUrl = supabase.storage.from("avatars").getPublicUrl(up.path).data.publicUrl;
                }
            }
            await updateServer.mutateAsync({
                serverId: server.id,
                name: name.trim(),
                ...(imageUrl ? { imageUrl } : {}),
            });
            utils.community.listServers.invalidate();
            utils.community.getServer.invalidate({ serverId: server.id });
            setSaving(false);
            onClose();
        } catch (e) {
            console.error("Server update failed:", e);
            setSaving(false);
        }
    };

    return (
        <>
            <Dialog open={isModalOpen} onOpenChange={handleClose}>
                <DialogContent className="gap-5 rounded-4xl border-none p-6 sm:max-w-[440px]" showCloseButton={false}>
                    <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Server settings</DialogTitle>

                    <div className="flex flex-col items-center gap-3 py-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "group relative grid size-24 cursor-pointer place-items-center overflow-hidden rounded-[28px] transition-colors",
                                previewSrc ? "" : "border border-dashed border-white/15 hover:border-white/30",
                            )}
                        >
                            {previewSrc ? (
                                <>
                                    <img src={previewSrc} alt="" className="size-full object-cover" />
                                    <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                        <HugeiconsIcon icon={ImageUploadIcon} className="size-6 text-white" strokeWidth={2} />
                                    </span>
                                </>
                            ) : (
                                <HugeiconsIcon icon={ImageUploadIcon} className="size-7 text-zinc-600 transition-colors group-hover:text-zinc-300" strokeWidth={2} />
                            )}
                        </button>
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

                    <Input
                        radius={16}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Server name"
                        maxLength={100}
                        className="h-13 text-center text-[15px] font-semibold tracking-tight"
                    />

                    <div className="flex gap-2">
                        <button
                            onClick={handleClose}
                            className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !name.trim()}
                            className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

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
