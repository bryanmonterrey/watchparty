"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, Edit02Icon, PlusSignIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { Panel } from "@/components/settings/ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePasskeys, useAddPasskey, useRenamePasskey, useDeletePasskey } from "@/hooks/use-passkeys";

interface Passkey {
    id: string;
    name: string | null;
    deviceType: string;
    backedUp: boolean;
    createdAt: Date | string | null;
}

export default function PasskeyManager() {
    const { data, isLoading } = usePasskeys();
    const addPasskey = useAddPasskey();
    const renamePasskey = useRenamePasskey();
    const deletePasskey = useDeletePasskey();

    const passkeys = data?.passkeys || [];

    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [selectedPasskey, setSelectedPasskey] = useState<Passkey | null>(null);
    const [newName, setNewName] = useState("");

    const handleAddPasskey = () => {
        addPasskey.mutate(newName, {
            onSuccess: () => {
                setShowAddDialog(false);
                setNewName("");
            },
        });
    };

    const handleRenamePasskey = () => {
        if (!selectedPasskey || !newName.trim()) return;

        renamePasskey.mutate(
            { passkeyId: selectedPasskey.id, name: newName },
            {
                onSuccess: () => {
                    setShowRenameDialog(false);
                    setNewName("");
                    setSelectedPasskey(null);
                },
            }
        );
    };

    const handleDeletePasskey = () => {
        if (!selectedPasskey) return;

        deletePasskey.mutate({ passkeyId: selectedPasskey.id }, {
            onSuccess: () => {
                setShowDeleteDialog(false);
                setSelectedPasskey(null);
            },
        });
    };

    const openRenameDialog = (passkey: Passkey) => {
        setSelectedPasskey(passkey);
        setNewName(passkey.name || "");
        setShowRenameDialog(true);
    };

    const openDeleteDialog = (passkey: Passkey) => {
        setSelectedPasskey(passkey);
        setShowDeleteDialog(true);
    };

    return (
        <Skeleton name="passkey-manager" loading={isLoading}>
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-[16px] font-bold tracking-tight text-white">Passkeys</h2>
                </div>
            </div>

            {/* Passkeys List */}
            {passkeys.length === 0 ? (
                <Panel className="px-6 py-12 text-center">
                    <HugeiconsIcon icon={SmartPhone01Icon} className="mx-auto mb-4 size-10 text-zinc-600" strokeWidth={2} />
                    <h3 className="text-[14px] font-bold text-zinc-400">No passkeys yet</h3>
                    <p className="mt-1 text-[12px] font-medium text-zinc-600">
                        Add a passkey to sign in with Face ID, Touch ID, or Windows Hello
                    </p>
                    <Button
                        onClick={() => setShowAddDialog(true)}
                        variant="ghost"
                        className="mt-4 rounded-full bg-white/10 font-bold hover:bg-white/20"
                    >
                        <HugeiconsIcon icon={PlusSignIcon} className="mr-2 size-4" strokeWidth={2} />
                        Add your first passkey
                    </Button>
                </Panel>
            ) : (
                <div className="space-y-2">
                    {passkeys.map((passkey) => (
                        <Panel
                            key={passkey.id}
                            className="flex items-center justify-between p-4"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-full bg-white/5">
                                    <HugeiconsIcon icon={SmartPhone01Icon} className="size-5 text-zinc-500" strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold text-white">
                                        {passkey.name || `Passkey ${passkey.id.slice(0, 8)} `}
                                    </h3>
                                    <p className="text-[12px] font-medium text-zinc-500">
                                        {passkey.deviceType} • Added{" "}
                                        {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "Unknown"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => openRenameDialog(passkey)}
                                    className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                                >
                                    <HugeiconsIcon icon={Edit02Icon} className="size-4" strokeWidth={2} />
                                </button>
                                <button
                                    onClick={() => openDeleteDialog(passkey)}
                                    className="cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-pastelred/10 hover:text-pastelred disabled:pointer-events-none disabled:opacity-40"
                                    disabled={passkeys.length <= 1}
                                >
                                    <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                                </button>
                            </div>
                        </Panel>
                    ))}
                    <div className="flex justify-end items-end w-full">
                        <Button
                            variant="ghost"
                            onClick={() => setShowAddDialog(true)}
                            className="rounded-full bg-white/10 font-bold hover:bg-white/20"
                        >
                            <HugeiconsIcon icon={PlusSignIcon} className="mr-2 size-4" strokeWidth={2} />
                            Add passkey
                        </Button>
                    </div>
                </div>
            )}

            {/* Add Passkey Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle>Add new passkey</DialogTitle>
                        <DialogDescription>
                            Follow the prompts to register a new biometric authentication method
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-400">
                            Your device will prompt you to use Face ID, Touch ID, or Windows Hello
                            to create a new passkey.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowAddDialog(false)}
                                variant="ghost"
                                className="flex-1 rounded-full bg-white/5 hover:bg-white/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddPasskey}
                                disabled={addPasskey.isPending}
                                className="flex-1 rounded-full bg-white font-bold text-black hover:bg-white/90"
                            >
                                {addPasskey.isPending ? "Adding…" : "Add passkey"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Passkey Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle>Rename passkey</DialogTitle>
                        <DialogDescription>
                            Give this passkey a memorable name
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g., iPhone 15 Pro, MacBook Air"
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => {
                                    setShowRenameDialog(false);
                                    setNewName("");
                                }}
                                variant="ghost"
                                className="flex-1 rounded-full bg-white/5 hover:bg-white/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleRenamePasskey}
                                disabled={!newName.trim()}
                                className="flex-1 rounded-full bg-white font-bold text-black hover:bg-white/90"
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Delete Passkey Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle>Delete passkey</DialogTitle>
                        <DialogDescription className="text-pastelred">
                            Are you sure you want to delete this passkey?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-400">
                            You won&apos;t be able to use this device for biometric authentication anymore.
                            {passkeys.length <= 1 && (
                                <span className="block mt-2 text-pastelred">
                                    ⚠️ This is your last passkey. Deleting it will disable passkey authentication.
                                </span>
                            )}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowDeleteDialog(false)}
                                variant="ghost"
                                className="flex-1 rounded-full bg-white/5 hover:bg-white/10"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeletePasskey}
                                className="flex-1 rounded-full bg-pastelred font-bold text-white hover:bg-pastelred/90"
                                disabled={passkeys.length <= 1}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </Skeleton>
    );
}
