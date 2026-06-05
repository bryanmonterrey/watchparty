"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import { User } from "lucide-react";
import AvatarUpload from "@/components/file-upload/avatar-upload";
import type { FileWithPreview } from "@/hooks/use-file-upload";
import { AnimatePresence, motion } from "framer-motion";
import { useUpdateProfile } from "@/hooks/use-update-profile";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { appToast } from "@/components/app-ui/app-toast";
export default function ProfileSettings() {
    const { data: session } = useAuthSession();
    const [isLoading, setIsLoading] = useState(true);
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
        } catch (e: any) {
            appToast.error(e.message || "Failed to claim fees");
        }
    };

    useEffect(() => {
        if (session?.user) {
            setUsername(session.user.username || "");
            setDisplayName(session.user.name || "");
            setBio(session.user.bio || "");
            // Bio would come from session if it exists in the user object
            setIsLoading(false);
        }
    }, [session]);

    const handleAvatarChange = (file: FileWithPreview | null) => {
        if (file?.file instanceof File) {
            setAvatarFile(file.file);
        } else {
            setAvatarFile(null);
        }
    };

    const handleSubmit = () => {
        const updates: any = {};

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
            onSuccess: (data) => {
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
                <h2 className="text-xl font-semibold">Profile Settings</h2>
            </div>

            {/* Avatar Section */}
            <div className="bg-greyy/25 rounded-3xl p-6">
                <h3 className="font-medium text-white mb-4">Avatar</h3>
                <AvatarUpload
                    key={resetCount} // Only re-render when explicitly reset
                    onFileChange={handleAvatarChange}
                    defaultAvatar={session.user.avatar_url || session.user.image || undefined}
                />
            </div>

            {/* Profile Information */}
            <div className="bg-greyy/25 rounded-3xl p-6 space-y-4">
                <h3 className="font-medium text-white mb-2">Profile Information</h3>

                {/* Username */}
                <div>
                    <label className="text-sm text-neutral-400 mb-2 block">Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter username"
                        className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-full text-white placeholder:text-neutral-500 focus:outline-none"
                    />
                </div>

                {/* Display Name */}
                <div>
                    <label className="text-sm text-neutral-400 mb-2 block">Display Name</label>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Enter display name"
                        className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-full text-white placeholder:text-neutral-500 focus:outline-none"
                    />
                </div>

                {/* Bio */}
                <div>
                    <label className="text-sm text-neutral-400 mb-2 block">Bio</label>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Tell us about yourself"
                        rows={4}
                        className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-3xl text-white placeholder:text-neutral-500 focus:outline-none resize-none"
                    />
                </div>
            </div>

            {/* Unclaimed Fees (Escrow) */}
            {escrows && escrows.length > 0 && (
                <div className="bg-greyy/25 rounded-3xl p-6 space-y-4 border border-zinc-800/50">
                    <h3 className="font-medium text-white mb-2">Unclaimed Creator Fees</h3>
                    <p className="text-sm text-neutral-400 mb-4">
                        You have pending fee shares from token launches that were routed to your social handle before you connected a wallet. Claim them now to your linked Solana wallet.
                    </p>
                    <div className="space-y-3">
                        {escrows.map(escrow => (
                            <div key={escrow.id} className="flex items-center justify-between p-4 rounded-xl bg-neutral-900/50 border border-neutral-800">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium text-white">Fee Split Share</div>
                                    <div className="text-xs text-neutral-400">
                                        {escrow.sharePercentage}% on {escrow.platform}
                                    </div>
                                </div>
                                <Button
                                    onClick={() => handleClaim(escrow.id)}
                                    disabled={claimMutation.isPending}
                                    variant="secondary"
                                    className="rounded-full text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                                >
                                            {claimMutation.isPending ? "Claiming..." : "Claim Fees"}
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Unsaved Changes Toast */}
            <AnimatePresence>
                {hasChanges && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-black/80 border border-white/10 p-4 rounded-3xl flex items-center justify-between gap-4 backdrop-blur-xl shadow-2xl z-50"
                    >
                        <p className="text-white font-medium pl-2">Careful — you have unsaved changes!</p>
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
                                className="bg-emerald-500 hover:bg-emerald-400 text-black font-medium px-6 rounded-full transition-all"
                            >
                                {updateProfile.isPending ? "Saving..." : "Save Changes"}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        </Skeleton>
    );
}
