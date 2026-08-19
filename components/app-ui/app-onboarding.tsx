"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from 'next/navigation'
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { authClient } from "@/lib/auth/client";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import AvatarUpload from "@/components/file-upload/avatar-upload";

// Onboarding: claim a handle → add a photo → done. First-run surface, so it
// gets the delight budget: a fixed-size stage (steps never resize the
// dialog), slide+blur step transitions (blur masks the crossfade), a live
// pixel-font handle preview with debounced availability, and a springy
// completion beat. Avatar is skippable — the username is the only thing the
// product actually needs.

type OnboardingStep =
    | "name_setup"
    | "username_setup"
    | "avatar_setup"
    | "complete";

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;
const EASE = [0.23, 1, 0.32, 1] as const;

function StepShell({ children, reduceMotion }: { children: React.ReactNode; reduceMotion: boolean }) {
    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 32, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -32, filter: "blur(4px)" }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
        >
            {children}
        </motion.div>
    );
}

export default function OnboardingDialog() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const reduceMotion = !!useReducedMotion();
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<OnboardingStep>("username_setup");
    const [username, setUsername] = useState("");
    const [name, setName] = useState("");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Debounced live availability — only queried once the format is valid.
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const id = setTimeout(() => setDebounced(username), 350);
        return () => clearTimeout(id);
    }, [username]);
    const formatValid = debounced.length >= 3 && debounced.length <= 20 && USERNAME_RE.test(debounced);
    const availability = trpc.user.checkUsername.useQuery(
        { username: debounced },
        { enabled: isOpen && step === "username_setup" && formatValid, staleTime: 30_000 },
    );
    const isSettled = debounced === username;
    const available = formatValid && isSettled && availability.data?.available === true;
    const taken = formatValid && isSettled && availability.data?.available === false;

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
                    setStep("username_setup");
                    return;
                }

                const { data: session } = await authClient.getSession();

                if (!session) return;

                const hasUsername = !!session.user.username;

                if (hasUsername) {
                    setIsOpen(false);
                    return;
                }

                // Pre-fill name from the session (OAuth provides one, email-OTP
                // doesn't). Name is mandatory — collect it first when missing,
                // otherwise jump straight to the handle.
                setName(session.user.name ?? "");
                setIsOpen(true);
                setStep(session.user.name ? "username_setup" : "name_setup");
            } catch (error) {
                console.error("Error checking onboarding status:", error);
            }
        };

        checkOnboardingStatus();
    }, [searchParams]);

    const handleNameSubmit = () => {
        const trimmed = name.trim();
        if (!trimmed) {
            setError("Name is required");
            return;
        }
        if (trimmed.length > 50) {
            setError("Name must be 50 characters or less");
            return;
        }
        setName(trimmed);
        setError("");
        setStep("username_setup");
    };

    const handleUsernameSubmit = async () => {
        if (!username.trim()) {
            setError("Username is required");
            return;
        }

        if (username.length < 3 || username.length > 20) {
            setError("Username must be between 3 and 20 characters");
            return;
        }

        if (!USERNAME_RE.test(username)) {
            setError("Username can only contain letters, numbers, underscores, and hyphens");
            return;
        }

        if (loading) return; // Prevent double-clicks

        try {
            setLoading(true);
            setError("");

            // Save username + display name together (name is mandatory and was
            // collected in the name step, or pre-filled from an OAuth session).
            const response = await fetch("/api/update-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, displayName: name.trim() }),
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
            }, 1600);
        } catch (error) {
            console.error("❌ Avatar upload failed:", error);
            setError(error instanceof Error ? error.message : "Failed to upload avatar");
        } finally {
            setLoading(false);
        }
    };

    // Username is the only hard requirement — the photo can wait.
    const handleSkipAvatar = () => {
        setStep("complete");
        setTimeout(() => {
            setIsOpen(false);
            router.replace("/");
            router.refresh();
        }, 1600);
    };

    const handleClose = () => {
        if (step === "complete") {
            setIsOpen(false);
            router.replace("/");
        }
    };

    // Availability line under the live preview: height is reserved so the
    // layout never shifts between states.
    const statusLine = (() => {
        if (!username) return null;
        if (username.length < 3) return { text: "Keep going — at least 3 characters", tone: "muted" as const };
        if (!USERNAME_RE.test(username)) return { text: "Letters, numbers, underscores and hyphens only", tone: "bad" as const };
        if (username.length > 20) return { text: "Maximum 20 characters", tone: "bad" as const };
        if (!isSettled || availability.isFetching) return { text: "Checking availability…", tone: "muted" as const };
        if (taken) return { text: `@${username} is taken`, tone: "bad" as const };
        if (available) return { text: `@${username} is yours`, tone: "good" as const };
        return null;
    })();

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent
                className="overflow-hidden rounded-4xl p-0 sm:max-w-[580px]"
                showCloseButton={false}
            >
                {/* Fixed-size stage: steps swap inside, the dialog never resizes. */}
                <div className="flex h-[620px] max-h-[85svh] flex-col px-8 pb-8 pt-10 sm:px-12">
                    <AnimatePresence mode="wait" initial={false}>
                        {step === "name_setup" && (
                            <StepShell key="name" reduceMotion={reduceMotion}>
                                <div className="text-center">
                                    <p className="font-pixel text-[13px] tracking-[0.2em] text-zinc-500">WELCOME TO WATCHPARTY</p>
                                    <DialogTitle className="mt-3 text-[26px] font-bold tracking-tight text-white">What&apos;s your name?</DialogTitle>
                                    <p className="mt-1.5 text-[14px] font-medium text-zinc-500">This is the name people see across watchparty. You can change it later.</p>
                                </div>

                                {/* Live preview — mirrors the handle step's hero */}
                                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-4">
                                    <p
                                        className={cn(
                                            "max-w-full truncate px-2 text-[clamp(28px,7vw,44px)] font-bold leading-none tracking-tight transition-colors duration-200",
                                            name ? "text-white" : "text-zinc-800",
                                        )}
                                    >
                                        {name || "Your name"}
                                    </p>
                                </div>

                                <form
                                    className="space-y-3"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleNameSubmit();
                                    }}
                                >
                                    <Input
                                        radius={18}
                                        type="text"
                                        value={name}
                                        onChange={(e) => {
                                            setName(e.target.value);
                                            setError("");
                                        }}
                                        placeholder="Your name"
                                        autoFocus
                                        maxLength={50}
                                        className="h-14 text-center text-[16px] font-semibold tracking-tight"
                                    />
                                    {error && <p className="text-center text-[12px] font-medium text-pastelred">{error}</p>}
                                    <Button
                                        type="submit"
                                        size="hero"
                                        className="bg-white text-black transition-transform hover:bg-white/90 active:scale-[0.98]"
                                        disabled={!name.trim()}
                                    >
                                        Continue
                                    </Button>
                                </form>
                            </StepShell>
                        )}

                        {step === "username_setup" && (
                            <StepShell key="username" reduceMotion={reduceMotion}>
                                <div className="text-center">
                                    <p className="font-pixel text-[13px] tracking-[0.2em] text-zinc-500">WELCOME TO WATCHPARTY</p>
                                    <DialogTitle className="mt-3 text-[26px] font-bold tracking-tight text-white">Claim your handle</DialogTitle>
                                    <p className="mt-1.5 text-[14px] font-medium text-zinc-500">One name, everywhere on watchparty. You can change it later.</p>
                                </div>

                                {/* Live preview — the handle is the hero */}
                                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-4">
                                    <p
                                        className={cn(
                                            "max-w-full truncate px-2 font-pixel text-[clamp(28px,7vw,44px)] leading-none tracking-tight transition-colors duration-200",
                                            username ? "text-white" : "text-zinc-800",
                                        )}
                                    >
                                        @{username || "yourname"}
                                    </p>
                                    <div className="flex h-5 items-center">
                                        {statusLine && (
                                            <p
                                                className={cn(
                                                    "flex items-center gap-1.5 text-[13px] font-medium transition-colors duration-200",
                                                    statusLine.tone === "good" && "text-white",
                                                    statusLine.tone === "bad" && "text-pastelred",
                                                    statusLine.tone === "muted" && "text-zinc-500",
                                                )}
                                            >
                                                {statusLine.tone === "good" && <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />}
                                                {statusLine.text}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <form
                                    className="space-y-3"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleUsernameSubmit();
                                    }}
                                >
                                    <Input
                                        radius={18}
                                        type="text"
                                        value={username}
                                        onChange={(e) => {
                                            setUsername(e.target.value.trim());
                                            setError("");
                                        }}
                                        placeholder="username"
                                        autoFocus
                                        maxLength={20}
                                        className="h-14 text-center text-[16px] font-semibold tracking-tight"
                                    />
                                    {error && <p className="text-center text-[12px] font-medium text-pastelred">{error}</p>}
                                    <Button
                                        type="submit"
                                        size="hero"
                                        className="bg-white text-black transition-transform hover:bg-white/90 active:scale-[0.98]"
                                        disabled={loading || !available}
                                    >
                                        {loading ? "Claiming…" : available ? `Claim @${username}` : "Claim your handle"}
                                    </Button>
                                </form>
                            </StepShell>
                        )}

                        {step === "avatar_setup" && (
                            <StepShell key="avatar" reduceMotion={reduceMotion}>
                                <div className="text-center">
                                    <p className="font-pixel text-[13px] tracking-[0.2em] text-zinc-500">@{username.toUpperCase()}</p>
                                    <DialogTitle className="mt-3 text-[26px] font-bold tracking-tight text-white">Put a face to the name</DialogTitle>
                                    <p className="mt-1.5 text-[14px] font-medium text-zinc-500">Profiles with a photo get noticed first.</p>
                                </div>

                                <div className="flex min-h-0 flex-1 items-center justify-center py-4">
                                    <AvatarUpload onFileChange={handleFileChange} />
                                </div>

                                <div className="space-y-3">
                                    {error && <p className="text-center text-[12px] font-medium text-pastelred">{error}</p>}
                                    <Button
                                        onClick={handleAvatarUpload}
                                        size="hero"
                                        className="bg-white text-black transition-transform hover:bg-white/90 active:scale-[0.98]"
                                        disabled={loading || !avatarFile}
                                    >
                                        {loading ? "Uploading…" : "Complete profile"}
                                    </Button>
                                    <button
                                        onClick={handleSkipAvatar}
                                        disabled={loading}
                                        className="h-10 w-full cursor-pointer rounded-full text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                                    >
                                        Skip for now
                                    </button>
                                </div>
                            </StepShell>
                        )}

                        {step === "complete" && (
                            <StepShell key="complete" reduceMotion={reduceMotion}>
                                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                                    <motion.div
                                        initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", duration: 0.5, bounce: 0.25 }}
                                        className="grid size-16 place-items-center rounded-full bg-white/10"
                                    >
                                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-8 text-white" strokeWidth={2} />
                                    </motion.div>
                                    <div className="text-center">
                                        <DialogTitle className="text-[26px] font-bold tracking-tight text-white">You&apos;re in</DialogTitle>
                                        <p className="mt-1.5 font-pixel text-[15px] text-zinc-500">@{username || "friend"}</p>
                                    </div>
                                </div>
                            </StepShell>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
