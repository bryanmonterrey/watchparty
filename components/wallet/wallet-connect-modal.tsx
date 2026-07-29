"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Button } from "@/components/ui/button";
import { Wallet, Fingerprint, ArrowLeft } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { authClient } from "@/lib/auth/client";
import { appToast } from "@/components/app-ui/app-toast";
import { useState, useTransition, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from 'next/navigation'
import { useIsMobile } from "@/hooks/use-mobile";
import { Tray } from "@/components/ui/tray";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { MessagesIcon, GoogleIcon, XIcon, KickIcon, TwitchIcon, QrIcon } from "../icons";

interface WalletConnectModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function ResponsiveModal({
    open,
    onOpenChange,
    title,
    description,
    className,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title?: string;
    description?: string;
    className?: string;
    children: React.ReactNode;
}) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <Tray
                open={open}
                onOpenChange={onOpenChange}
                title={title}
                description={description}
                className={className}
            >
                {children}
            </Tray>
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                onOpenAutoFocus={(e) => e.preventDefault()}
                className={cn(
                    "bg-zinc-950 flex flex-col rounded-[2.25rem] border border-zinc-800 outline-none w-[361px] max-w-[95vw] overflow-hidden p-0 gap-0",
                    className
                )}
            >
                <div className="flex-1 bg-zinc-950">
                    <div className="pt-8 px-5">
                        {title ? (
                            <div className="mb-0 text-center">
                                <DialogTitle className="font-medium text-white mb-2 text-xl">
                                    {title}
                                </DialogTitle>
                                {description && (
                                    <DialogDescription className="text-zinc-500 text-sm">
                                        {description}
                                    </DialogDescription>
                                )}
                            </div>
                        ) : (
                            <VisuallyHidden>
                                <DialogTitle>Sign In</DialogTitle>
                                <DialogDescription>Authentication modal</DialogDescription>
                            </VisuallyHidden>
                        )}
                    </div>
                    {children}
                </div>
            </DialogContent>
        </Dialog>
    );
}

const RESEND_COOLDOWN = 60;

export function WalletConnectModal({ open, onOpenChange }: WalletConnectModalProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { wallets, select } = useWallet();
    const [isLoading, startTransition] = useTransition();
    const [loadingAction, setLoadingAction] = useState<string>("");

    // Email OTP Flow State
    const [flowState, setFlowState] = useState<"email" | "otp">("email");
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");

    // Resend countdown
    const [resendCountdown, setResendCountdown] = useState(0);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startResendCountdown = () => {
        setResendCountdown(RESEND_COOLDOWN);
        countdownRef.current = setInterval(() => {
            setResendCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            const timer = setTimeout(() => {
                setFlowState("email");
                setOtp("");
                setResendCountdown(0);
                if (countdownRef.current) clearInterval(countdownRef.current);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [open]);

    // Separate WalletConnect from other wallets
    const walletConnectAdapter = wallets.find(
        (wallet) => wallet.adapter.name === "WalletConnect"
    );

    const detectedWallets = wallets.filter(
        (wallet) =>
            wallet.adapter.name !== "WalletConnect" &&
            (wallet.readyState === WalletReadyState.Installed ||
                wallet.readyState === WalletReadyState.Loadable)
    );

    const handleWalletSelect = async (walletName: string) => {
        try {
            select(walletName as any);
            onOpenChange(false);
        } catch (error) {
            appToast.error("Failed to connect wallet");
        }
    };

    const handlePasskeySignIn = () => {
        setLoadingAction("passkey");
        startTransition(async () => {
            try {
                const { data: signInData, error: signInError } = await authClient.signIn.passkey();

                if (signInError) {
                    const errorMessage = signInError.message || signInError.statusText || JSON.stringify(signInError);
                    appToast.error(`Passkey error: ${errorMessage}`);
                    return;
                }

                if (signInData) {
                    onOpenChange(false);
                    await queryClient.invalidateQueries({ queryKey: ["session"] });
                    router.refresh();
                    appToast.success("Signed in with passkey!");
                } else {
                    appToast.error("Passkey authentication failed.");
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!message.includes("cancelled") && !message.includes("abort") && !message.includes("NotAllowedError")) {
                    appToast.error(`Passkey sign-in failed: ${message}`);
                }
            } finally {
                setLoadingAction("");
            }
        });
    };

    const handleSocialLogin = (provider: "google" | "twitter" | "kick" | "twitch") => {
        setLoadingAction(provider);
        startTransition(async () => {
            try {
                await authClient.signIn.social({
                    provider,
                    callbackURL: `${window.location.origin}/`,
                });
                onOpenChange(false);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                appToast.error(`${provider} sign-in failed: ${message}`);
                setLoadingAction("");
            }
        });
    };

    const sendOtp = (targetEmail: string) => {
        setLoadingAction("email");
        startTransition(async () => {
            try {
                // @ts-ignore
                const { error } = await authClient.emailOtp.sendVerificationOtp({
                    email: targetEmail,
                    type: "sign-in"
                });

                if (error) {
                    appToast.error(error.message || "Failed to send code");
                    return;
                }

                setFlowState("otp");
                startResendCountdown();
            } catch (error) {
                appToast.error("Something went wrong");
            } finally {
                setLoadingAction("");
            }
        });
    };

    const handleEmailSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !email.includes("@")) {
            appToast.error("Please enter a valid email address");
            return;
        }
        sendOtp(email);
    };

    const handleResend = () => {
        if (resendCountdown > 0) return;
        sendOtp(email);
    };

    const handleOtpSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (otp.length !== 6) return;
        verifyOtp(otp);
    };

    const verifyOtp = (code: string) => {
        setLoadingAction("otp-verify");
        startTransition(async () => {
            try {
                // @ts-ignore
                const { data, error } = await authClient.signIn.emailOtp({
                    email,
                    otp: code,
                });

                if (error) {
                    appToast.error(error.message || "Invalid or expired code");
                    setOtp("");
                    return;
                }

                if (data) {
                    onOpenChange(false);
                    await queryClient.invalidateQueries({ queryKey: ["session"] });
                    router.refresh();
                    appToast.success("Signed in successfully!");
                }
            } catch (error) {
                appToast.error("Something went wrong");
            } finally {
                setLoadingAction("");
            }
        });
    };

    // OTP Verification View
    if (flowState === "otp") {
        const isVerifying = loadingAction === "otp-verify";

        return (
            <ResponsiveModal
                open={open}
                onOpenChange={onOpenChange}
                className="max-w-[400px]"
            >
                <VisuallyHidden>
                    <DialogTitle>Enter code</DialogTitle>
                    <DialogDescription>Enter the 6-digit code sent to {email}</DialogDescription>
                </VisuallyHidden>
                <div className="flex flex-col items-center p-5 pb-8 gap-6">
                    {/* Back button */}
                    <button
                        type="button"
                        onClick={() => { setFlowState("email"); setOtp(""); }}
                        className="self-start flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        Back
                    </button>

                    {/* Header */}
                    <div className="text-center space-y-1.5">
                        <p className="text-white font-semibold text-lg">Check your email</p>
                        <p className="text-zinc-500 text-sm">
                            We sent a 6-digit code to
                        </p>
                        <p className="text-zinc-300 text-sm font-medium">{email}</p>
                    </div>

                    {/* OTP Input */}
                    <form onSubmit={handleOtpSubmit} className="flex flex-col items-center gap-4 w-full">
                        <InputOTP
                            maxLength={6}
                            value={otp}
                            onChange={(val) => {
                                setOtp(val);
                                if (val.length === 6) verifyOtp(val);
                            }}
                            disabled={isVerifying}
                        >
                            <InputOTPGroup>
                                <InputOTPSlot index={0} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                                <InputOTPSlot index={1} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                                <InputOTPSlot index={2} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                                <InputOTPSlot index={3} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                                <InputOTPSlot index={4} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                                <InputOTPSlot index={5} className="w-12 h-12 text-lg border-zinc-700 bg-zinc-900/50" />
                            </InputOTPGroup>
                        </InputOTP>

                        {isVerifying && (
                            <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Verifying...
                            </div>
                        )}
                    </form>

                    {/* Resend */}
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendCountdown > 0 || isLoading}
                        className={cn(
                            "text-sm transition-colors",
                            resendCountdown > 0 || isLoading
                                ? "text-zinc-600 cursor-default"
                                : "text-bleu hover:text-bleu/80 cursor-pointer"
                        )}
                    >
                        {loadingAction === "email" ? (
                            <span className="flex items-center gap-1.5">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Sending...
                            </span>
                        ) : resendCountdown > 0 ? (
                            `Resend code in ${resendCountdown}s`
                        ) : (
                            "Resend code"
                        )}
                    </button>
                </div>
            </ResponsiveModal>
        );
    }

    // Main Sign In View
    return (
        <ResponsiveModal
            open={open}
            onOpenChange={onOpenChange}
            title="Sign In"
            description="Choose how you'd like to connect"
            className="max-w-[400px] p-0 overflow-hidden"
        >
            <div className="flex flex-col gap-3 p-5 pb-8">

                {/* Email Input */}
                <form onSubmit={handleEmailSubmit} className="relative flex items-center bg-transparent rounded-2xl border border-zinc-800 p-1 py-2 pl-3 focus-within:ring-2 focus-within:ring-bleu">
                    <div className="p-1 mr-2 bg-zinc-600/15 rounded-lg h-fit w-fit shrink-0 flex items-center pointer-events-none">
                        <MessagesIcon className="w-5 h-5 text-zinc-500 shrink-0" />
                    </div>
                    <Input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        className="border-0 bg-transparent dark:bg-transparent ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 shadow-none text-base"
                        required
                    />
                    <Button
                        type="submit"
                        size="sm"
                        disabled={isLoading || !email}
                        className="rounded-xl ml-2 shrink-0 bg-transparent text-bleu disabled:text-white/30 h-9 min-w-[80px]"
                    >
                        {loadingAction === "email" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            "Send code"
                        )}
                    </Button>
                </form>

                {/* Social Squares */}
                <div className="grid grid-cols-4 gap-3 mt-1">
                    {(
                        [
                            { provider: "google" as const, icon: <GoogleIcon className="w-6 h-6" /> },
                            { provider: "twitter" as const, icon: <XIcon className="w-6 h-6 text-white" /> },
                            { provider: "kick" as const, icon: <KickIcon className="w-6 h-6 text-[#53F50D]" /> },
                            { provider: "twitch" as const, icon: <TwitchIcon className="w-6 h-6 text-[#9146FF]" /> },
                        ] as const
                    ).map(({ provider, icon }) => (
                        <Button
                            key={provider}
                            variant="outline"
                            className="w-full aspect-square rounded-xl bg-transparent border-zinc-800 hover:bg-zinc-600/15 flex items-center justify-center p-2"
                            onClick={() => handleSocialLogin(provider)}
                            disabled={isLoading}
                        >
                            {loadingAction === provider ? (
                                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
                            ) : (
                                icon
                            )}
                        </Button>
                    ))}
                </div>

                {/* Wallet List */}
                <div className="flex flex-col gap-2 mt-1">
                    {walletConnectAdapter && (
                        <Button
                            variant="outline"
                            className="w-full justify-start gap-4 h-14 rounded-2xl bg-transparent border-zinc-800 hover:bg-zinc-600/15"
                            onClick={() => handleWalletSelect(walletConnectAdapter.adapter.name)}
                            disabled={isLoading}
                        >
                            <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0">
                                <QrIcon className="w-10 h-10 text-white" />
                            </div>
                            <span className="font-medium text-base">Sign in with QR code</span>
                        </Button>
                    )}

                    {detectedWallets.map((wallet) => (
                        <Button
                            key={wallet.adapter.name}
                            variant="outline"
                            className="w-full justify-start gap-4 h-14 rounded-2xl bg-transparent border-zinc-800 hover:bg-zinc-600/15"
                            onClick={() => handleWalletSelect(wallet.adapter.name)}
                            disabled={isLoading}
                        >
                            <div className="flex items-center justify-center w-10 h-10 rounded-full shrink-0 overflow-hidden p-1.5">
                                {wallet.adapter.icon ? (
                                    <Image
                                        src={wallet.adapter.icon}
                                        alt={wallet.adapter.name}
                                        width={24}
                                        height={24}
                                    />
                                ) : (
                                    <Wallet className="w-4 h-4" />
                                )}
                            </div>
                            <span className="font-medium text-base text-zinc-100">{wallet.adapter.name}</span>
                        </Button>
                    ))}
                </div>

                {/* Passkey — styled as a real button */}
                <Button
                    variant="ghost"
                    className="w-full rounded-2xl group bg-transparent gap-3 mt-1 text-zinc-300 hover:text-paramount font-medium text-sm transition-colors duration-200 cursor-pointer ease-in-out"
                    onClick={handlePasskeySignIn}
                    disabled={isLoading}
                >
                    <span className="group-hover:text-bleu transition-colors duration-200 ease-in-out">
                        {loadingAction === "passkey" ? "Authenticating..." : "Sign in with passkey"}
                    </span>
                </Button>

            </div>
        </ResponsiveModal>
    );
}
