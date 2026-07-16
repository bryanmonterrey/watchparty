"use client";

import { useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

// Create (or rename, when data.category is set) a channel category — the
// collapsible Discord-style groups in the channel sidebar.
export function CreateCategoryModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const [name, setName] = useState("");
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "createCategory";
    const renaming = data.category ?? null;

    // Seed the input with the current name when opening in rename mode
    useEffect(() => {
        if (isModalOpen) setName(renaming?.name ?? "");
    }, [isModalOpen, renaming]);

    const invalidate = () => {
        if (data.server?.id) utils.community.getServer.invalidate({ serverId: data.server.id });
    };
    const createCategory = trpc.community.createCategory.useMutation({
        onSuccess: () => { invalidate(); handleClose(); },
    });
    const renameCategory = trpc.community.renameCategory.useMutation({
        onSuccess: () => { invalidate(); handleClose(); },
    });

    const handleClose = () => {
        setName("");
        onClose();
    };

    const pending = createCategory.isPending || renameCategory.isPending;

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || !data.server?.id || pending) return;
        if (renaming) {
            renameCategory.mutate({ serverId: data.server.id, categoryId: renaming.id, name: trimmed });
        } else {
            createCategory.mutate({ serverId: data.server.id, name: trimmed });
        }
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="gap-5 rounded-4xl border-none p-6 sm:max-w-[440px]" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">
                    {renaming ? "Rename category" : "Create a category"}
                </DialogTitle>

                <form onSubmit={onSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <Input
                            radius={14}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={pending}
                            placeholder="New category"
                            maxLength={50}
                            autoFocus
                            className="h-12 text-[14px]"
                        />
                        {!renaming && (
                            <p className="px-1 text-[12px] font-medium text-zinc-600">
                                Categories group channels into collapsible sections in the sidebar.
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={pending || !name.trim()}
                        className="h-12 w-full cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
                    >
                        {pending ? (renaming ? "Renaming…" : "Creating…") : renaming ? "Rename category" : "Create category"}
                    </button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
