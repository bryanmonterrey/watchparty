"use client";

import { useState } from "react";
import { Copy, Check, Download, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SeedPhraseDisplayProps {
    mnemonic: string;
    onConfirm?: () => void;
    showConfirmation?: boolean;
}

export default function SeedPhraseDisplay({
    mnemonic,
    onConfirm,
    showConfirmation = true,
}: SeedPhraseDisplayProps) {
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [isBlurred, setIsBlurred] = useState(false);

    const words = mnemonic.split(" ");

    const handleCopy = async () => {
        await navigator.clipboard.writeText(mnemonic);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const element = document.createElement("a");
        const file = new Blob([`Solana Wallet Recovery Phrase\n\n${mnemonic}\n\nKeep this safe and never share it with anyone!`], {
            type: "text/plain",
        });
        element.href = URL.createObjectURL(file);
        element.download = "solana-recovery-phrase.txt";
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    const handleConfirmClick = () => {
        setConfirmed(true);
        onConfirm?.();
    };

    return (
        <div className="space-y-6">
            {/* Warning Banner */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-4">
                <div className="flex gap-3">
                    <div className="text-red-500 mt-0.5">⚠️</div>
                    <div className="space-y-1">
                        <p className="text-red-400 font-semibold text-sm">Critical: Save Your Recovery Phrase</p>
                        <p className="text-red-300/80 text-xs">
                            This is the ONLY way to recover your wallet. Write it down and store it securely offline.
                            Never share it with anyone.
                        </p>
                    </div>
                </div>
            </div>

            {/* Seed Phrase Grid */}
            <div className="relative">
                <div className={`grid grid-cols-3 gap-3 ${isBlurred ? "blur-md" : ""}`}>
                    {words.map((word, index) => (
                        <div
                            key={index}
                            className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 flex items-center gap-2"
                        >
                            <span className="text-neutral-500 text-xs w-6">{index + 1}.</span>
                            <span className="text-white  text-sm">{word}</span>
                        </div>
                    ))}
                </div>

                {/* Blur Toggle */}
                <button
                    onClick={() => setIsBlurred(!isBlurred)}
                    className="absolute top-2 right-2 p-2 bg-neutral-800/80 hover:bg-neutral-700 rounded-3xl transition-colors"
                    title={isBlurred ? "Show phrase" : "Hide phrase"}
                >
                    {isBlurred ? (
                        <Eye className="w-4 h-4 text-neutral-400" />
                    ) : (
                        <EyeOff className="w-4 h-4 text-neutral-400" />
                    )}
                </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
                <Button
                    onClick={handleCopy}
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-neutral-900 border-neutral-800 py-5 hover:bg-neutral-800"
                >
                    {copied ? (
                        <>
                            <Check className="w-4 h-4 mr-2" />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="w-4 h-4 mr-2" />
                            Copy All
                        </>
                    )}
                </Button>
                <Button
                    onClick={handleDownload}
                    variant="outline"
                    size="sm"
                    className="flex-1 bg-neutral-900 border-neutral-800 py-5 hover:bg-neutral-800"
                >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                </Button>
            </div>

            {/* Confirmation Checkbox */}
            {showConfirmation && (
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-4 bg-neutral-900 border border-neutral-800 rounded-3xl">
                        <input
                            type="checkbox"
                            id="confirm-saved"
                            checked={confirmed}
                            onChange={(e) => setConfirmed(e.target.checked)}
                            className="mt-1 w-4 h-4 rounded-3xl border-neutral-700 bg-neutral-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <label htmlFor="confirm-saved" className="text-sm text-neutral-300 cursor-pointer">
                            I have written down my recovery phrase and stored it in a safe place. I understand that
                            if I lose this phrase, I will lose access to my wallet forever.
                        </label>
                    </div>

                    <Button
                        onClick={handleConfirmClick}
                        disabled={!confirmed}
                        size="lg"
                        className="w-full py-5 bg-neutral-900 hover:bg-neutral-700/70 disabled:bg-neutral-800 disabled:text-white/80 text-white"
                    >
                        I've Saved My Recovery Phrase
                    </Button>
                </div>
            )}
        </div>
    );
}
