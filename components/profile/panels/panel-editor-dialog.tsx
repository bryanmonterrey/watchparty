"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Squircle } from "@/components/ui/squircle";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { appToast } from "@/components/app-ui/app-toast";
import { Loader2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Image02Icon } from "@hugeicons/core-free-icons";
import type { PanelData } from "./panel-card";

// Create/edit one profile panel: upload art (any aspect — panels live on the
// uploaded image), optional title/link/body. `panel === null` = create.

export function PanelEditorDialog({ panel, open, onOpenChange }: {
    panel: PanelData | null;
    open: boolean;
    onOpenChange: (o: boolean) => void;
}) {
    const [title, setTitle] = React.useState("");
    const [linkUrl, setLinkUrl] = React.useState("");
    const [body, setBody] = React.useState("");
    const [imageUrl, setImageUrl] = React.useState<string | null>(null);
    const [imageFile, setImageFile] = React.useState<File | null>(null);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);
    const [saving, setSaving] = React.useState(false);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const save = trpc.panels.save.useMutation();
    const utils = trpc.useUtils();

    React.useEffect(() => {
        if (!open) return;
        setTitle(panel?.title ?? "");
        setLinkUrl(panel?.linkUrl ?? "");
        setBody(panel?.body ?? "");
        setImageUrl(panel?.imageUrl ?? null);
        setImageFile(null);
        setImagePreview(panel?.imageUrl ?? null);
    }, [open, panel]);

    const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        e.target.value = "";
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let finalImageUrl = imageUrl;
            if (imageFile) {
                const sanitized = imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "banners",
                    filename: sanitized,
                    contentType: imageFile.type,
                });
                const { data, error } = await supabase.storage
                    .from("banners")
                    .uploadToSignedUrl(path, token, imageFile);
                if (error) throw error;
                finalImageUrl = supabase.storage.from("banners").getPublicUrl(data.path).data.publicUrl;
            }

            await save.mutateAsync({
                id: panel?.id,
                title: title.trim() || null,
                linkUrl: linkUrl.trim() || null,
                body: body.trim() || null,
                imageUrl: finalImageUrl,
            });
            await utils.panels.list.invalidate();
            appToast.success(panel ? "Panel updated" : "Panel added");
            onOpenChange(false);
        } catch (err) {
            appToast.error(err instanceof Error ? err.message : "Failed to save panel");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-md">
                <DialogTitle className="text-white">{panel ? "Edit panel" : "Add panel"}</DialogTitle>
                <DialogDescription className="text-zinc-500">
                    An image with an optional link and text — shown on your About tab.
                </DialogDescription>

                <div className="flex flex-col gap-4">
                    <label className="cursor-pointer">
                        <Squircle asChild radius={16}>
                            <div className="relative flex min-h-[120px] items-center justify-center overflow-hidden bg-zinc-900/60 transition-colors hover:bg-zinc-900">
                                {imagePreview ? (
                                    <img src={imagePreview} alt="Panel" className="w-full object-cover" />
                                ) : (
                                    <span className="flex flex-col items-center gap-2 py-8 text-zinc-500">
                                        <HugeiconsIcon icon={Image02Icon} className="size-7" />
                                        <span className="text-xs font-bold">Upload panel image</span>
                                    </span>
                                )}
                            </div>
                        </Squircle>
                        <input type="file" accept="image/*" className="hidden" onChange={pickImage} />
                    </label>
                    {imagePreview && (
                        <button
                            onClick={() => { setImageFile(null); setImagePreview(null); setImageUrl(null); }}
                            className="self-start text-xs font-bold text-zinc-500 transition-colors hover:text-white"
                        >
                            Remove image
                        </button>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Title</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Follow my socials" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Link</Label>
                        <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} maxLength={500} placeholder="https://…" className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">Text</Label>
                        <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={3} placeholder="Optional description shown under the image" className="resize-none rounded-2xl border-white/5 bg-zinc-900/50 p-3.5 text-white" />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving || (!imagePreview && !title.trim() && !body.trim())}
                        className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-[15px] font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
                    >
                        {saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : panel ? "Save panel" : "Add panel"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
