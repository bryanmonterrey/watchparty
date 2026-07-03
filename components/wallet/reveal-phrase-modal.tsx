"use client";

"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { AlertTriangle, Shield } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import SeedPhraseDisplay from "@/components/wallet/seed-phrase-display";

interface RevealPhraseModalProps {
    isOpen: boolean;
    onClose: () => void;
}

import { useRevealPhrase } from "@/hooks/use-wallet-sensitive";

export default function RevealPhraseModal({ isOpen, onClose }: RevealPhraseModalProps) {
    const [step, setStep] = useState<"warning" | "verifying" | "loading" | "display">("warning");
    const [mnemonic, setMnemonic] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const revealPhrase = useRevealPhrase();

    const handleVerifyPasskey = async () => {
        try {
            setLoading(true);
            setError(null);
            setStep("verifying");

            // Trigger passkey authentication (this will show the biometric prompt)
            const result = await authClient.signIn.passkey({
                fetchOptions: {
                    onSuccess: () => {
                        // Passkey verification successful, now fetch the recovery phrase
                        handleFetchPhrase();
                    },
                    onError: (ctx: any) => {
                        throw new Error(ctx.error.message || "Passkey verification failed");
                    },
                },
            });

            // If we get here without error, verification succeeded
            if (!result.error) {
                await handleFetchPhrase();
            } else {
                throw new Error(result.error.message || "Passkey verification failed");
            }
        } catch (err) {
            console.error("Passkey verification failed:", err);
            setError(err instanceof Error ? err.message : "Passkey verification failed. Please try again.");
            setStep("warning");
            setLoading(false);
        }
    };

    const handleFetchPhrase = async () => {
        try {
            setStep("loading");

            const data = await revealPhrase.mutateAsync();

            setMnemonic(data.mnemonic);
            setStep("display");
        } catch (err) {
            console.error("Failed to reveal phrase:", err);
            setError(err instanceof Error ? err.message : "Failed to reveal recovery phrase");
            setStep("warning");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setStep("warning");
        setMnemonic(null);
        setError(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="border-neutral-800 max-w-2xl">
                {/* Warning Step */}
                {step === "warning" && (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-red-500" />
                                </div>
                                <DialogTitle className="text-xl text-white">Reveal Recovery Phrase</DialogTitle>
                            </div>
                            <DialogDescription className="text-neutral-400 space-y-3">
                                <p className="font-medium text-white">⚠️ Security Warning</p>
                                <p>You are about to view your wallet's recovery phrase. Please ensure:</p>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    <li>You are in a private location</li>
                                    <li>No one can see your screen</li>
                                    <li>No cameras or recording devices are nearby</li>
                                    <li>You understand anyone with this phrase controls your wallet</li>
                                </ul>
                            </DialogDescription>
                        </DialogHeader>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-4">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
                            <div className="flex gap-3">
                                <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                                <div className="space-y-1 text-sm">
                                    <p className="text-blue-400 font-medium">Biometric Verification Required</p>
                                    <p className="text-neutral-300">
                                        You'll be prompted to verify your identity with Face ID, Touch ID, or Windows Hello
                                        before viewing your recovery phrase.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <Button
                                onClick={handleClose}
                                variant="outline"
                                className="flex-1 bg-neutral-900 border-neutral-800"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleVerifyPasskey}
                                disabled={loading}
                                className="flex-1 bg-red-600 hover:bg-red-700"
                            >
                                <Shield className="w-4 h-4 mr-2" />
                                {loading ? "Verifying..." : "Continue"}
                            </Button>
                        </div>
                    </>
                )}

                {/* Verifying Passkey Step */}
                {step === "verifying" && (
                    <Skeleton name="reveal-phrase-value" loading={true}>
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-center text-white flex items-center justify-center gap-2">
                                    <Shield className="w-5 h-5 text-blue-500" />
                                    Verifying Identity
                                </DialogTitle>
                                <DialogDescription className="text-center text-neutral-400">
                                    Please complete the biometric authentication on your device
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-6">
                                <p className="text-white">Awaiting biometric confirmation...</p>
                                <p className="text-neutral-400 text-sm">This may take a moment depending on your device.</p>
                                <p className="text-neutral-500 text-xs">Please do not close this window.</p>
                            </div>
                        </>
                    </Skeleton>
                )}

                {/* Loading Step */}
                {step === "loading" && (
                    <Skeleton name="reveal-phrase-actions" loading={true}>
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-center text-white">Retrieving Recovery Phrase...</DialogTitle>
                                <DialogDescription className="text-center text-neutral-400">
                                    Please wait while we securely decrypt your recovery phrase
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-6">
                                <div className="grid grid-cols-3 gap-2">
                                    {["word one", "word two", "word three", "word four", "word five", "word six", "word seven", "word eight", "word nine", "word ten", "word eleven", "word twelve"].map((word, i) => (
                                        <div key={i} className="h-8 rounded-lg bg-neutral-800 flex items-center justify-center">
                                            <span className="text-xs text-neutral-300">{word}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    </Skeleton>
                )}

                {/* Display Step */}
                {step === "display" && mnemonic && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl text-white">Your Recovery Phrase</DialogTitle>
                            <DialogDescription className="text-neutral-400">
                                Keep this phrase safe and never share it with anyone
                            </DialogDescription>
                        </DialogHeader>
                        <SeedPhraseDisplay mnemonic={mnemonic} showConfirmation={false} />
                        <Button onClick={handleClose} className="w-full mt-4 bg-neutral-900 hover:bg-neutral-800">
                            Close
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
