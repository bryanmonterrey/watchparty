"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";

export function CreateServerModal() {
    const { isOpen, onClose, type } = useCommunityModal();
    const router = useRouter();
    const [name, setName] = useState("");
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "createServer";

    const createServer = trpc.community.createServer.useMutation({
        onSuccess: (server) => {
            setName("");
            onClose();
            utils.community.listServers.invalidate();
            router.push(`/communities/${server.id}`);
        },
    });

    const handleClose = () => {
        setName("");
        onClose();
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        createServer.mutate({ name });
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleClose}>
            <DialogContent className="border-none text-white p-0 overflow-hidden">
                <DialogHeader className="pt-8 px-6">
                    <DialogTitle className="text-2xl text-center font-bold">
                        Create your server
                    </DialogTitle>
                    <DialogDescription className="text-center text-zinc-400">
                        Give your server a personality with a name. You can always change it later.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="space-y-8">
                    <div className="space-y-4 px-6">
                        <div>
                            <Label className="uppercase text-xs font-bold text-zinc-400">
                                Server name
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={createServer.isPending}
                                className="mt-1.5 bg-zinc-900/50 border-none text-white placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-indigo-500"
                                placeholder="Enter server name"
                                autoFocus
                            />
                        </div>
                    </div>

                    <DialogFooter className="bg-zinc-900/30 px-6 py-4">
                        <Button
                            disabled={createServer.isPending || !name.trim()}
                            className="bg-indigo-500 hover:bg-indigo-600 text-white"
                        >
                            {createServer.isPending ? "Creating..." : "Create"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
