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
import AvatarUpload from "@/components/file-upload/avatar-upload";

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
    const [message, setMessage] = useState("");
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

        if (username.length < 4 || username.length > 15) {
            setError("Username must be between 4 and 15 characters");
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
            setMessage("Saving username...");

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
            setMessage("Upload an avatar");
        } catch (error) {
            console.error("❌ Username save failed:", error);
            setError(error instanceof Error ? error.message : "Failed to save username");
            setMessage("");
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
            setMessage("Uploading avatar...");

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
            setMessage("Profile completed successfully!");

            setTimeout(() => {
                setIsOpen(false);
                router.replace("/");
                router.refresh();
            }, 2000);
        } catch (error) {
            console.error("❌ Avatar upload failed:", error);
            setError(error instanceof Error ? error.message : "Failed to upload avatar");
            setMessage("");
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
                className="sm:max-w-xl rounded-4xl border-none p-8 gap-6"
                showCloseButton={step === "complete"}
            >
                {step === "username_setup" && (
                    <>
                        <DialogHeader>
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-900 flex items-center justify-center">
                                <svg className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <DialogTitle className="text-center text-white text-xl">Choose Username</DialogTitle>
                            <DialogDescription className="text-center text-zinc-400">
                                This will be your unique identifier
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        setError("");
                                    }}
                                    placeholder="Enter username"
                                    className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-full text-white placeholder:text-zinc-500 focus:outline-none focus:ring-none"
                                />
                                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                                <p className="text-zinc-500 text-xs mt-2">
                                    3-20 characters, letters, numbers, underscores and hyphens only
                                </p>
                            </div>
                            <Button
                                onClick={handleUsernameSubmit}
                                size="lg"
                                className="w-full bg-zinc-900 border border-zinc-600/10 hover:bg-zinc-800 text-white text-lg font-semibold py-6 rounded-full"
                                disabled={!username.trim()}
                            >
                                Next
                            </Button>
                        </div>
                    </>
                )}

                {step === "avatar_setup" && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-center text-white text-2xl">Upload Avatar</DialogTitle>
                            <DialogDescription className="text-center text-zinc-400">

                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <AvatarUpload
                                onFileChange={handleFileChange}
                            />
                            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                            <Button
                                onClick={handleAvatarUpload}
                                className="w-full bg-neutral-900 border border-zinc-600/10 hover:bg-neutral-800 text-white text-lg font-semibold py-6.5 rounded-full"
                                disabled={loading || !avatarFile}
                            >
                                {loading ? "Uploading..." : "Complete Profile"}
                            </Button>
                        </div>
                    </>
                )}

                {step === "complete" && (
                    <>
                        <DialogHeader>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <DialogTitle className="text-center text-white">{message}</DialogTitle>
                            </div>
                        </DialogHeader>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
