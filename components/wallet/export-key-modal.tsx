"use client";

"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { AlertTriangle, Key, Copy, Check, Download, Shield } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

interface ExportKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

import { useExportKey } from "@/hooks/use-wallet-sensitive";

export default function ExportKeyModal({ isOpen, onClose }: ExportKeyModalProps) {
    const [step, setStep] = useState<"warning" | "verifying" | "loading" | "display">("warning");
    const [privateKey, setPrivateKey] = useState<string | null>(null);
    const [address, setAddress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    const exportKey = useExportKey();

    const handleVerifyPasskey = async () => {
        try {
            setLoading(true);
            setError(null);
            setStep("verifying");

            // Trigger passkey authentication (this will show the biometric prompt)
            const result = await authClient.signIn.passkey({
                fetchOptions: {
                    onSuccess: () => {
                        // Passkey verification successful, now export the key
                        handleExportKey();
                    },
                    onError: (ctx: any) => {
                        throw new Error(ctx.error.message || "Passkey verification failed");
                    },
                },
            });

            // If we get here without error, verification succeeded
            if (!result.error) {
                await handleExportKey();
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

    const handleExportKey = async () => {
        try {
            setStep("loading");

            const data = await exportKey.mutateAsync();

            setPrivateKey(data.privateKey);
            setAddress(data.address);
            setStep("display");
        } catch (err) {
            console.error("Failed to export key:", err);
            const errorMessage = err instanceof Error ? err.message : "Failed to export private key";
            setError(errorMessage);
            setStep("warning"); // Go back to warning to show the error
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async () => {
        if (privateKey) {
            await navigator.clipboard.writeText(privateKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDownload = () => {
        if (!privateKey || !address) return;

        const content = `Solana Private Key\n\nAddress: ${address}\nPrivate Key: ${privateKey}\n\nWARNING: Keep this safe and never share it with anyone!`;
        const element = document.createElement("a");
        const file = new Blob([content], { type: "text/plain" });
        element.href = URL.createObjectURL(file);
        element.download = `solana-private-key-${address.slice(0, 8)}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleClose = () => {
        setStep("warning");
        setPrivateKey(null);
        setAddress(null);
        setError(null);
        setCopied(false);
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
                                <div className="w-12 h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                                </div>
                                <DialogTitle className="text-xl text-white">Export Private Key</DialogTitle>
                            </div>
                            <DialogDescription className="text-neutral-400 space-y-3">
                                <p className="font-medium text-yellow-400">⚠️ EXTREME CAUTION REQUIRED</p>
                                <p>You are about to export your wallet's private key. This is EXTREMELY sensitive:</p>
                                <ul className="list-disc list-inside space-y-1 text-sm">
                                    <li>Anyone with your private key has FULL CONTROL of your wallet</li>
                                    <li>This is MORE sensitive than your recovery phrase</li>
                                    <li>Never share this with anyone, including support staff</li>
                                    <li>Only export if you know exactly what you're doing</li>
                                    <li>Make sure no one can see your screen</li>
                                </ul>
                                <p className="text-xs text-neutral-500 mt-4">
                                    Rate limited to 3 exports per hour for security.
                                </p>
                            </DialogDescription>
                        </DialogHeader>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-4 mb-4">
                                <p className="text-red-400 text-sm font-medium">{error}</p>
                            </div>
                        )}

                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
                            <div className="flex gap-3">
                                <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
                                <div className="space-y-1 text-sm">
                                    <p className="text-blue-400 font-medium">Biometric Verification Required</p>
                                    <p className="text-neutral-300">
                                        You'll be prompted to verify your identity with Face ID, Touch ID, or Windows Hello
                                        before exporting your private key.
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
                                className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                            >
                                <Shield className="w-4 h-4 mr-2" />
                                {loading ? "Verifying..." : "I Understand, Continue"}
                            </Button>
                        </div>
                    </>
                )}

                {/* Verifying Passkey Step */}
                {step === "verifying" && (
                    <Skeleton name="export-key-value" loading={true}>
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
                    <Skeleton name="export-key-actions" loading={true}>
                        <>
                            <DialogHeader>
                                <DialogTitle className="text-center text-white">Exporting Private Key...</DialogTitle>
                                <DialogDescription className="text-center text-neutral-400">
                                    Please wait while we securely decrypt your private key
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 py-6">
                                <p className="text-white text-sm">Decrypting your private key securely...</p>
                                <p className="text-neutral-400 text-sm w-4/5">Verifying rate limits and preparing export.</p>
                                <div className="h-10 w-full rounded-lg bg-neutral-800 flex items-center justify-center">
                                    <span className="text-xs text-neutral-400 ">••••••••••••••••••••••••••••••••••••••••••••••••</span>
                                </div>
                            </div>
                        </>
                    </Skeleton>
                )}

                {/* Display Step */}
                {step === "display" && privateKey && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="text-xl text-white">Your Private Key</DialogTitle>
                            <DialogDescription className="text-yellow-400">
                                ⚠️ Keep this absolutely secret. Never share it with anyone.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4">
                            {/* Address */}
                            <div>
                                <label className="text-sm text-neutral-400 mb-2 block">Wallet Address</label>
                                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                                    <p className="text-white  text-sm break-all">{address}</p>
                                </div>
                            </div>

                            {/* Private Key */}
                            <div>
                                <label className="text-sm text-neutral-400 mb-2 block">Private Key (Base58)</label>
                                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                                    <p className="text-white text-sm break-all">{privateKey}</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">
                                <Button
                                    onClick={handleCopy}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 bg-neutral-900 border-neutral-800"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 mr-2" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copy Key
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={handleDownload}
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 bg-neutral-900 border-neutral-800"
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download
                                </Button>
                            </div>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                                <p className="text-yellow-400 text-sm">
                                    This key will only be shown once. Make sure you've saved it securely before closing this window.
                                </p>
                            </div>
                        </div>

                        <Button onClick={handleClose} className="w-full mt-4 bg-neutral-900 hover:bg-neutral-800">
                            Close
                        </Button>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
