"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Smile, Plus, Trash2, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function CustomEmotesManager() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const utils = trpc.useUtils();
    const fileRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState("");
    const [uploading, setUploading] = useState(false);

    const { data: emotes, isLoading } = trpc.creator.getEmotes.useQuery({ creatorId: userId }, { enabled: !!userId });

    const addEmote = trpc.creator.addEmote.useMutation({
        onSuccess: () => { toast.success("Emote added!"); utils.creator.getEmotes.invalidate(); setName(""); },
        onError: (e) => toast.error(e.message),
    });
    const deleteEmote = trpc.creator.deleteEmote.useMutation({
        onSuccess: () => { toast.success("Emote removed"); utils.creator.getEmotes.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !name.trim()) { toast.error("Enter a name first"); return; }
        if (file.size > 256 * 1024) { toast.error("Max 256KB"); return; }

        setUploading(true);
        try {
            const { signedUrl, fullPath } = await getPresignedUrl.mutateAsync({ bucket: "emotes", filename: file.name, contentType: file.type });
            await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
            const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/emotes/${fullPath}`;
            await addEmote.mutateAsync({ name: name.trim(), imageUrl: publicUrl });
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Smile className="w-5 h-5 text-yellow-400" />
                <h2 className="text-base font-bold text-zinc-100">Custom Emotes</h2>
                <span className="text-xs text-zinc-500">({emotes?.length ?? 0}/50)</span>
            </div>

            {/* Add form */}
            <div className="rounded-[20px] bg-panel p-3 flex gap-2">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder=":emote_name:"
                    className="flex-1 px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || !name.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/15 text-white hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Upload
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/gif,image/webp" className="hidden" onChange={handleFile} />
            </div>

            {/* Emote grid */}
            {isLoading ? (
                <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>
            ) : emotes?.length === 0 ? (
                <div className="text-center py-10 text-zinc-600">
                    <Smile className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No emotes yet</p>
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-2">
                    {emotes?.map(e => (
                        <div key={e.id} className="group relative aspect-square rounded-lg bg-zinc-800 overflow-hidden">
                            <img src={e.imageUrl} alt={e.name} className="w-full h-full object-contain p-1" />
                            <div className="absolute inset-x-0 bottom-0 bg-zinc-950/80 text-center py-0.5">
                                <p className="text-[10px] text-zinc-400 truncate px-1">{e.name}</p>
                            </div>
                            <button
                                onClick={() => deleteEmote.mutate({ emoteId: e.id })}
                                className="absolute top-1 right-1 p-1 rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
