"use client";

import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Upload, X, Image as ImageIcon, Video, Globe, Users, Loader2 } from "lucide-react";

interface StoryCreatorProps {
    open: boolean;
    onClose: () => void;
}

type MediaPreview = { file: File; preview: string; type: "image" | "video" };

export function StoryCreator({ open, onClose }: StoryCreatorProps) {
    const [media, setMedia] = useState<MediaPreview | null>(null);
    const [caption, setCaption] = useState("");
    const [visibility, setVisibility] = useState<"public" | "followers">("followers");
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const utils = trpc.useUtils();

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const createStory = trpc.story.createStory.useMutation({
        onSuccess: () => {
            utils.story.getActiveStories.invalidate();
            toast.success("Story posted!");
            handleClose();
        },
        onError: err => toast.error(err.message),
    });

    const handleClose = () => {
        setMedia(null);
        setCaption("");
        setVisibility("followers");
        onClose();
    };

    const handleFileSelect = useCallback((files: FileList | null) => {
        if (!files || files.length === 0) return;
        const file = files[0];
        const isVideo = file.type.startsWith("video/");
        const preview = URL.createObjectURL(file);
        setMedia({ file, preview, type: isVideo ? "video" : "image" });
    }, []);

    const handleSubmit = async () => {
        if (!media) return;
        setIsUploading(true);
        try {
            const sanitized = media.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
            const { token, path } = await getPresignedUrl.mutateAsync({
                bucket: "stories",
                filename: sanitized,
                contentType: media.file.type,
            });
            const { data, error } = await supabase.storage
                .from("stories")
                .uploadToSignedUrl(path, token, media.file);
            if (error) throw error;
            const { data: pub } = supabase.storage.from("stories").getPublicUrl(data!.fullPath);

            await createStory.mutateAsync({
                mediaUrl: pub.publicUrl,
                mediaType: media.type,
                caption: caption.trim() || undefined,
            });
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to upload story");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && handleClose()}>
            <DialogContent className="border-white/10 max-w-sm p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-3">
                    <DialogTitle className="text-zinc-100">New Story</DialogTitle>
                </DialogHeader>

                <div className="px-5 pb-5 flex flex-col gap-4">
                    {/* Media drop zone */}
                    {!media ? (
                        <div
                            className="rounded-2xl border-2 border-dashed border-white/15 hover:border-white/30 transition-colors flex flex-col items-center justify-center gap-3 py-12 cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                        >
                            <div className="flex gap-3">
                                <ImageIcon className="w-6 h-6 text-zinc-500" />
                                <Video className="w-6 h-6 text-zinc-500" />
                            </div>
                            <p className="text-sm text-zinc-400">Drop image or video, or click to browse</p>
                            <Upload className="w-4 h-4 text-zinc-500" />
                        </div>
                    ) : (
                        <div className="relative rounded-2xl overflow-hidden aspect-[9/16] max-h-60 bg-zinc-900">
                            {media.type === "video" ? (
                                <video src={media.preview} className="w-full h-full object-cover" muted />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={media.preview} alt="" className="w-full h-full object-cover" />
                            )}
                            <button
                                onClick={() => setMedia(null)}
                                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}

                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*" onChange={e => handleFileSelect(e.target.files)} />

                    {/* Caption */}
                    <input
                        placeholder="Add a caption…"
                        value={caption}
                        onChange={e => setCaption(e.target.value)}
                        maxLength={200}
                        className="bg-zinc-900/50 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/30 transition-colors"
                    />

                    {/* Visibility */}
                    <div className="flex gap-2">
                        {([
                            { value: "public", label: "Everyone", icon: Globe },
                            { value: "followers", label: "Followers", icon: Users },
                        ] as const).map(({ value, label, icon: Icon }) => (
                            <button
                                key={value}
                                onClick={() => setVisibility(value)}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition-colors",
                                    visibility === value
                                        ? "border-lantern bg-lantern/10 text-lantern"
                                        : "border-white/10 text-zinc-400 hover:border-white/20"
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={!media || isUploading || createStory.isPending}
                        className="w-full bg-white text-black hover:bg-zinc-200 font-bold rounded-full"
                    >
                        {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</> : "Share Story"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
