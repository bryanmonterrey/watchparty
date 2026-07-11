"use client";

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { FolderOpen, Plus, Trash2, Star, Upload, Loader2, FolderPlus, Image, Film } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function MediaVault() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id ?? "";
    const utils = trpc.useUtils();
    const fileRef = useRef<HTMLInputElement>(null);
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState("");
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [uploading, setUploading] = useState(false);

    const { data: folders, isLoading: foldersLoading } = trpc.creator.getVaultFolders.useQuery(undefined, { enabled: !!userId });
    const { data: media, isLoading: mediaLoading } = trpc.creator.getVaultMedia.useQuery(
        { folderId: selectedFolderId ?? undefined },
        { enabled: !!userId }
    );

    const createFolder = trpc.creator.createVaultFolder.useMutation({
        onSuccess: () => { toast.success("Folder created"); utils.creator.getVaultFolders.invalidate(); setNewFolderName(""); setShowNewFolder(false); },
        onError: (e) => toast.error(e.message),
    });
    const deleteFolder = trpc.creator.deleteVaultFolder.useMutation({
        onSuccess: () => { toast.success("Folder deleted"); utils.creator.getVaultFolders.invalidate(); setSelectedFolderId(null); },
        onError: (e) => toast.error(e.message),
    });
    const addMedia = trpc.creator.addVaultMedia.useMutation({
        onSuccess: () => { toast.success("Uploaded!"); utils.creator.getVaultMedia.invalidate(); },
        onError: (e) => toast.error(e.message),
    });
    const toggleFav = trpc.creator.toggleVaultFavorite.useMutation({
        onSuccess: () => utils.creator.getVaultMedia.invalidate(),
    });
    const deleteMedia = trpc.creator.deleteVaultMedia.useMutation({
        onSuccess: () => { toast.success("Deleted"); utils.creator.getVaultMedia.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();

    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        setUploading(true);
        try {
            for (const file of files) {
                const isVideo = file.type.startsWith("video/");
                const { signedUrl, fullPath } = await getPresignedUrl.mutateAsync({
                    bucket: "vault",
                    filename: file.name,
                    contentType: file.type,
                });
                await fetch(signedUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
                const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vault/${fullPath}`;
                await addMedia.mutateAsync({
                    folderId: selectedFolderId ?? undefined,
                    url: publicUrl,
                    type: isVideo ? "video" : "image",
                    name: file.name,
                    size: file.size,
                    mimeType: file.type,
                });
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    return (
        <div className="flex gap-4 h-full min-h-[400px]">
            {/* Sidebar */}
            <div className="w-44 shrink-0 space-y-1">
                <button
                    onClick={() => setSelectedFolderId(null)}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", selectedFolderId === null ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5")}
                >
                    <FolderOpen className="w-4 h-4" /> All Media
                </button>

                {foldersLoading ? (
                    <div className="space-y-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
                ) : folders?.map(f => (
                    <div key={f.id} className="group flex items-center gap-1">
                        <button
                            onClick={() => setSelectedFolderId(f.id)}
                            className={cn("flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors truncate", selectedFolderId === f.id ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/5")}
                        >
                            <FolderOpen className="w-4 h-4 shrink-0" />
                            <span className="truncate">{f.name}</span>
                        </button>
                        <button onClick={() => deleteFolder.mutate({ folderId: f.id })} className="p-1 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                ))}

                {showNewFolder ? (
                    <form onSubmit={e => { e.preventDefault(); if (newFolderName.trim()) createFolder.mutate({ name: newFolderName.trim() }); }} className="flex gap-1">
                        <input
                            autoFocus
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            placeholder="Folder name"
                            className="flex-1 px-2 py-1.5 bg-zinc-800 rounded-lg text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-white/30"
                            onBlur={() => { if (!newFolderName.trim()) setShowNewFolder(false); }}
                        />
                    </form>
                ) : (
                    <button onClick={() => setShowNewFolder(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:text-zinc-400 hover:bg-white/5 transition-colors">
                        <FolderPlus className="w-4 h-4" /> New folder
                    </button>
                )}
            </div>

            {/* Main content */}
            <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">{media?.items.length ?? 0} items</p>
                    <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-white hover:bg-white/20 text-sm font-medium transition-colors disabled:opacity-40"
                    >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload
                    </button>
                    <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleUpload} />
                </div>

                {mediaLoading ? (
                    <div className="grid grid-cols-3 gap-2">{Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>
                ) : (media?.items.length ?? 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
                        <Image className="w-10 h-10 mb-3 opacity-30" />
                        <p className="text-sm">No media here yet</p>
                        <p className="text-xs mt-1">Upload images or videos</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-2">
                        {media?.items.map(item => (
                            <div key={item.id} className="group relative aspect-square rounded-lg bg-zinc-800 overflow-hidden">
                                {item.type === "video" ? (
                                    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                        <Film className="w-8 h-8 text-zinc-600" />
                                    </div>
                                ) : (
                                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                                )}
                                {/* Actions overlay */}
                                <div className="absolute inset-0 bg-zinc-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button onClick={() => toggleFav.mutate({ mediaId: item.id })} className={cn("p-1.5 rounded-full transition-colors", item.isFavorite ? "bg-amber-400 text-zinc-950" : "bg-white/20 text-white hover:bg-white/30")}>
                                        <Star className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => deleteMedia.mutate({ mediaId: item.id })} className="p-1.5 rounded-full bg-red-500/90 text-white hover:bg-red-500 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                {item.isFavorite && (
                                    <div className="absolute top-1 right-1">
                                        <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
