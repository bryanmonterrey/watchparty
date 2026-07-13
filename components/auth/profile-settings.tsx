"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import AvatarUpload from "@/components/file-upload/avatar-upload";
import type { FileWithPreview } from "@/hooks/use-file-upload";
import { AnimatePresence, motion } from "framer-motion";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { appToast } from "@/components/app-ui/app-toast";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { Panel } from "@/components/settings/ui";
export default function ProfileSettings() {
    const { data: session } = useAuthSession();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [bio, setBio] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);

    const [resetCount, setResetCount] = useState(0);

    const updateProfile = useUpdateProfile();

    // Escrow Claims
    const { data: escrows, refetch: refetchEscrows } = trpc.escrow.getMyPendingEscrows.useQuery(undefined, {
        enabled: !!session?.user
    });
    const claimMutation = trpc.escrow.claimEscrow.useMutation();

    const handleClaim = async (id: string) => {
        try {
            const result = await claimMutation.mutateAsync({ escrowId: id });
            if (result.success) {
                appToast.success("Fees claimed successfully!");
                refetchEscrows();
            }
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : "Failed to claim fees");
        }
    };

    // Seed the form when the session user arrives/changes — render-time
    // adjustment instead of an effect (react-hooks/set-state-in-effect)
    const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
    if (session?.user && syncedUserId !== session.user.id) {
        setSyncedUserId(session.user.id);
        setUsername(session.user.username || "");
        setDisplayName(session.user.name || "");
        setBio(session.user.bio || "");
    }
    const isLoading = !session?.user;

    const handleAvatarChange = (file: FileWithPreview | null) => {
        if (file?.file instanceof File) {
            setAvatarFile(file.file);
        } else {
            setAvatarFile(null);
        }
    };

    const handleSubmit = () => {
        const updates: { username?: string; displayName?: string; bio?: string; avatar?: File } = {};

        if (username !== session?.user?.username) {
            updates.username = username;
        }

        if (displayName !== session?.user?.name) {
            updates.displayName = displayName;
        }

        if (bio !== (session?.user?.bio || "")) {
            updates.bio = bio;
        }

        if (avatarFile) {
            updates.avatar = avatarFile;
        }

        updateProfile.mutate(updates, {
            onSuccess: () => {
                setAvatarFile(null);
                setResetCount(prev => prev + 1); // Reset avatar component
            },
        });
    };

    const hasChanges =
        username !== (session?.user?.username || "") ||
        displayName !== (session?.user?.name || "") ||
        bio !== (session?.user?.bio || "") ||
        avatarFile !== null;

    const handleReset = () => {
        if (session?.user) {
            setUsername(session.user.username || "");
            setDisplayName(session.user.name || "");
            setBio(session.user.bio || "");
            setAvatarFile(null);
            setResetCount(prev => prev + 1); // Reset avatar component
        }
    };

    return (
        <Skeleton name="profile-settings" loading={isLoading || !session}>
        <div className="space-y-4 w-full hidden-scrollbar pb-8">
            {/* Header */}
            <div>
                <h2 className="text-[16px] font-bold tracking-tight text-white">Profile</h2>
            </div>

            {/* Avatar Section */}
            <Panel className="p-6">
                <h3 className="mb-4 text-[14px] font-semibold text-zinc-300">Avatar</h3>
                <AvatarUpload
                    key={resetCount} // Only re-render when explicitly reset
                    onFileChange={handleAvatarChange}
                    defaultAvatar={session?.user?.avatar_url || session?.user?.image || undefined}
                />
            </Panel>

            {/* Profile Information */}
            <Panel className="space-y-4 p-6">
                <h3 className="text-[14px] font-semibold text-zinc-300">Profile information</h3>

                {/* Username */}
                <div>
                    <label className="mb-2 block text-[12px] font-medium text-zinc-500">Username</label>
                    <Input
                        radius={16}
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter username"
                        className="h-12 text-[14px]"
                    />
                </div>

                {/* Display Name */}
                <div>
                    <label className="mb-2 block text-[12px] font-medium text-zinc-500">Display Name</label>
                    <Input
                        radius={16}
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter display name"
                        className="h-12 text-[14px]"
                    />
                </div>

                {/* Bio */}
                <div>
                    <label className="mb-2 block text-[12px] font-medium text-zinc-500">Bio</label>
                    <Squircle asChild radius={16}>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself"
                            rows={4}
                            className="w-full resize-none rounded-none bg-white/[0.06] px-4 py-3 text-[14px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.1]"
                        />
                    </Squircle>
                </div>
            </Panel>

            {/* Unclaimed Fees (Escrow) */}
            {escrows && escrows.length > 0 && (
                <Panel className="space-y-4 p-6">
                    <h3 className="text-[14px] font-semibold text-zinc-300">Unclaimed creator fees</h3>
                    <p className="text-[12px] font-medium text-zinc-500">
                        You have pending fee shares from token launches that were routed to your social handle before you connected a wallet. Claim them now to your linked Solana wallet.
                    </p>
                    <div className="space-y-3">
                        {escrows.map(escrow => (
                            <div key={escrow.id} className="flex items-center justify-between rounded-[16px] bg-white/[0.04] p-4">
                                <div className="space-y-1">
                                    <div className="text-[14px] font-semibold text-white">Fee split share</div>
                                    <div className="text-[12px] font-medium text-zinc-500">
                                        {escrow.sharePercentage}% on {escrow.platform}
                                    </div>
                                </div>
                                <Button
                                    onClick={() => handleClaim(escrow.id)}
                                    disabled={claimMutation.isPending}
                                    variant="secondary"
                                    className="rounded-full text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                >
                                            {claimMutation.isPending ? "Claiming…" : "Claim fees"}
                                </Button>
                            </div>
                        ))}
                    </div>
                </Panel>
            )}

            {/* Unsaved Changes Toast */}
            <AnimatePresence>
                {hasChanges && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="fixed bottom-6 left-1/2 z-50 flex w-[90%] max-w-2xl -translate-x-1/2 items-center justify-between gap-4 rounded-full bg-black/80 p-3 pl-5 ring-1 ring-white/10 backdrop-blur-xl"
                    >
                        <p className="text-[14px] font-semibold text-white">Careful — you have unsaved changes!</p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                onClick={handleReset}
                                className="text-neutral-400 hover:text-white bg-white/10 rounded-full"
                            >
                                Reset
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={updateProfile.isPending}
                                className="rounded-full bg-white px-6 font-bold text-black transition-colors hover:bg-white/90"
                            >
                                {updateProfile.isPending ? "Saving…" : "Save changes"}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        </Skeleton>
    );
}
