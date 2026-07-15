"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from 'next/navigation'
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import AvatarUpload from "@/components/file-upload/avatar-upload";

// Two-step onboarding (username → photo) with a completion beat. Logic is
// untouched; the shell follows the current design language — step dots,
// icon chip, squircle input, wide white pill CTAs.
function StepDots({ step }: { step: "username_setup" | "avatar_setup" | "complete" }) {
    const idx = step === "username_setup" ? 0 : 1;
    if (step === "complete") return null;
    return (
        <div className="mb-1 flex justify-center gap-1.5">
            {[0, 1].map((i) => (
                <span
                    key={i}
                    className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        i === idx ? "w-6 bg-white" : "w-1.5 bg-white/15",
                    )}
                />
            ))}
        </div>
    );
}

type OnboardingStep =
    | "username_setup"
    | "avatar_setup"
    | "complete";

export default function OnboardingDialog() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<OnboardingStep>("username_setup");
    const [username, setUsername] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Handle avatar file change - deferred to avoid setState during render
    const handleFileChange = useCallback((file: any) => {
        setTimeout(() => {
            if (file?.file instanceof File) {
                setAvatarFile(file.file);
                setError("");
            } else {
                setAvatarFile(null);
            }
        }, 0);
    }, []);

    useEffect(() => {
        const checkOnboardingStatus = async () => {
            try {
                // Debug mode: force dialog open with ?debug-onboarding=true
                const debugMode = searchParams.get("debug-onboarding") === "true";

                if (debugMode) {
                    setIsOpen(true);
                    // You can change this to test different steps:
                    // "wallet_setup", "username_setup", or "avatar_setup"
                    setStep("avatar_setup");
                    return;
                }

                const { data: session } = await authClient.getSession();

                if (!session) return;

                const hasUsername = !!session.user.username;

                if (hasUsername) {
                    setIsOpen(false);
                    return;
                }

                setIsOpen(true);
                setStep("username_setup");
            } catch (error) {
                console.error("Error checking onboarding status:", error);
            }
        };

        checkOnboardingStatus();
    }, [searchParams]);

    const handleUsernameSubmit = async () => {
        if (!username.trim()) {
            setError("Username is required");
            return;
        }

        if (username.length < 3 || username.length > 20) {
            setError("Username must be between 3 and 20 characters");
            return;
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
            setError("Username can only contain letters, numbers, underscores, and hyphens");
            return;
        }

        if (loading) return; // Prevent double-clicks

        try {
            setLoading(true);
            setError("");

            // Save username first
            const response = await fetch("/api/update-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
            });

            if (!response.ok) {
                const contentType = response.headers.get("content-type");
                let errorMessage = "Failed to save username";
                if (contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    errorMessage = data.error || errorMessage;
                }
                throw new Error(errorMessage);
            }

            // Refresh session to get updated username
            await authClient.getSession();
            queryClient.invalidateQueries({ queryKey: ["session"] });

            // Move to avatar setup
            setError("");
            setStep("avatar_setup");
        } catch (error) {
            console.error("❌ Username save failed:", error);
            setError(error instanceof Error ? error.message : "Failed to save username");
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async () => {
        if (!avatarFile) {
            setError("Avatar is required");
            return;
        }

        if (loading) return; // Prevent double-clicks

        try {
            setLoading(true);
            setError("");

            // Upload avatar only (username already saved)
            const formData = new FormData();
            formData.append("avatar", avatarFile);

            const response = await fetch("/api/update-profile", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                let errorMessage = "Failed to upload avatar";
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await response.json();
                    errorMessage = data.error || errorMessage;
                }
                throw new Error(errorMessage);
            }

            // Refresh session to get updated avatar
            await authClient.getSession();
            queryClient.invalidateQueries({ queryKey: ["session"] });
            router.refresh();

            setStep("complete");

            setTimeout(() => {
                setIsOpen(false);
                router.replace("/");
                router.refresh();
            }, 2000);
        } catch (error) {
            console.error("❌ Avatar upload failed:", error);
            setError(error instanceof Error ? error.message : "Failed to upload avatar");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (step === "complete") {
            setIsOpen(false);
            router.replace("/");
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                className="gap-6 rounded-4xl border-none p-8 sm:max-w-md"
                showCloseButton={step === "complete"}
            >
                <StepDots step={step} />

                {step === "username_setup" && (
                    <>
                        <DialogHeader>
                            <div className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-white/5">
                                <HugeiconsIcon icon={UserCircleIcon} className="size-7 text-zinc-400" strokeWidth={1.8} />
                            </div>
                            <DialogTitle className="text-center text-[20px] font-bold tracking-tight text-white">Choose your username</DialogTitle>
                            <DialogDescription className="text-center text-[13px] font-medium text-zinc-500">
                                Your unique @handle on watchparty
                            </DialogDescription>
                        </DialogHeader>
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleUsernameSubmit();
                            }}
                        >
                            <div>
                                <Input
                                    radius={16}
                                    type="text"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        setError("");
                                    }}
                                    placeholder="username"
                                    autoFocus
                                    className="h-12 text-center text-[15px] font-semibold tracking-tight"
                                />
                                {error ? (
                                    <p className="mt-2 text-center text-[12px] font-medium text-pastelred">{error}</p>
                                ) : (
                                    <p className="mt-2 text-center text-[12px] font-medium text-zinc-600">
                                        3–20 characters · letters, numbers, underscores and hyphens
                                    </p>
                                )}
                            </div>
                            <Button
                                type="submit"
                                size="wide"
                                className="bg-white font-bold text-black hover:bg-white/90"
                                disabled={loading || !username.trim()}
                            >
                                {loading ? "Saving…" : "Continue"}
                            </Button>
                        </form>
                    </>
                )}

                {step === "avatar_setup" && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-center text-[20px] font-bold tracking-tight text-white">Add a profile photo</DialogTitle>
                            <DialogDescription className="text-center text-[13px] font-medium text-zinc-500">
                                Help people recognize you, @{username || "you"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <AvatarUpload
                                onFileChange={handleFileChange}
                            />
                            {error && <p className="text-center text-[12px] font-medium text-pastelred">{error}</p>}
                            <Button
                                onClick={handleAvatarUpload}
                                size="wide"
                                className="bg-white font-bold text-black hover:bg-white/90"
                                disabled={loading || !avatarFile}
                            >
                                {loading ? "Uploading…" : "Complete profile"}
                            </Button>
                        </div>
                    </>
                )}

                {step === "complete" && (
                    <DialogHeader>
                        <div className="flex flex-col items-center py-2">
                            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-white/10">
                                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-7 text-white" strokeWidth={2} />
                            </div>
                            <DialogTitle className="text-center text-[20px] font-bold tracking-tight text-white">You&apos;re all set</DialogTitle>
                            <DialogDescription className="mt-1 text-center text-[13px] font-medium text-zinc-500">
                                Welcome to watchparty, @{username || "friend"}
                            </DialogDescription>
                        </div>
                    </DialogHeader>
                )}
            </DialogContent>
        </Dialog>
    );
}
