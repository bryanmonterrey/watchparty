"use client";

import { useState } from "react";
import { Key, Trash2, Edit, Plus, Shield, Smartphone } from "lucide-react";
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
                    <h2 className="text-xl font-semibold">Passkey Management</h2>
                </div>
            </div>

            {/* Passkeys List */}
            {passkeys.length === 0 ? (
                <div className="bg-greyy/25 rounded-4xl p-8 text-center">
                    <Smartphone className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No Passkeys Yet</h3>
                    <p className="text-neutral-400 text-sm mb-4">
                        Add a passkey to enable biometric authentication
                    </p>
                    <Button
                        onClick={() => setShowAddDialog(true)}
                        variant="outline"
                        className="bg-neutral-800 border-neutral-800"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Your First Passkey
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {passkeys.map((passkey) => (
                        <div
                            key={passkey.id}
                            className="bg-greyy/25 rounded-3xl p-4 flex items-center justify-between transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-neutral-800/20 rounded-lg flex items-center justify-center">
                                    <Smartphone className="w-5 h-5 text-neutral-600" />
                                </div>
                                <div>
                                    <h3 className="font-medium">
                                        {passkey.name || `Passkey ${passkey.id.slice(0, 8)} `}
                                    </h3>
                                    <p className="text-sm text-neutral-400">
                                        {passkey.deviceType} • Added{" "}
                                        {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "Unknown"}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    onClick={() => openRenameDialog(passkey)}
                                    variant="outline"
                                    size="sm"
                                    className="bg-neutral-800 border-neutral-800"
                                >
                                    <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                    onClick={() => openDeleteDialog(passkey)}
                                    variant="outline"
                                    size="sm"
                                    className="bg-neutral-800 border-neutral-800 text-red-400 hover:text-red-300"
                                    disabled={passkeys.length <= 1}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    <div className="flex justify-end items-end w-full">
                        <Button
                            variant="outline"
                            onClick={() => setShowAddDialog(true)}
                            className=" text-neutral-200"
                        >
                            Add Passkey
                        </Button>
                    </div>
                </div>
            )}

            {/* Add Passkey Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle>Add New Passkey</DialogTitle>
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
                                variant="outline"
                                className="flex-1 bg-neutral-900 border-neutral-800"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleAddPasskey}
                                disabled={addPasskey.isPending}
                                className="flex-1 bg-blue-600 hover:bg-blue-700"
                            >
                                {addPasskey.isPending ? "Adding..." : "Add Passkey"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Passkey Dialog */}
            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle>Rename Passkey</DialogTitle>
                        <DialogDescription>
                            Give this passkey a memorable name
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g., iPhone 15 Pro, MacBook Air"
                            className="bg-neutral-900 border-neutral-800"
                        />
                        <div className="flex gap-2">
                            <Button
                                onClick={() => {
                                    setShowRenameDialog(false);
                                    setNewName("");
                                }}
                                variant="outline"
                                className="flex-1 bg-neutral-900 border-neutral-800"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleRenamePasskey}
                                disabled={!newName.trim()}
                                className="flex-1 bg-blue-600 hover:bg-blue-700"
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
                        <DialogTitle>Delete Passkey</DialogTitle>
                        <DialogDescription className="text-red-400">
                            Are you sure you want to delete this passkey?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-neutral-400">
                            You won't be able to use this device for biometric authentication anymore.
                            {passkeys.length <= 1 && (
                                <span className="block mt-2 text-red-400">
                                    ⚠️ This is your last passkey. Deleting it will disable passkey authentication.
                                </span>
                            )}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                onClick={() => setShowDeleteDialog(false)}
                                variant="outline"
                                className="flex-1 bg-neutral-900 border-neutral-800"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleDeletePasskey}
                                className="flex-1 bg-red-600 hover:bg-red-700"
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
