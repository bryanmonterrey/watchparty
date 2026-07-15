"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Download01Icon, Tick02Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

interface SeedPhraseDisplayProps {
    mnemonic: string;
    onConfirm?: () => void;
    showConfirmation?: boolean;
}

// Recovery phrase display. Starts REDACTED (screen-share safety) — the grid
// renders blurred behind a reveal button; copy/download only unlock once
// revealed, so the phrase can't leak while hidden.
export default function SeedPhraseDisplay({
    mnemonic,
    onConfirm,
    showConfirmation = true,
}: SeedPhraseDisplayProps) {
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [revealed, setRevealed] = useState(false);

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
        <div className="space-y-4">
            {/* Warning */}
            <Squircle asChild radius={16} autoEffects={false}>
                <div className="bg-pastelred/10 p-4">
                    <p className="text-[13px] font-bold text-pastelred">This phrase is your wallet</p>
                    <p className="mt-0.5 text-[12px] font-medium leading-relaxed text-pastelred/80">
                        Anyone with these 12 words controls your funds. Write them down, store them offline, and never share them.
                    </p>
                </div>
            </Squircle>

            {/* Word grid — redacted until revealed */}
            <div className="relative">
                <div
                    aria-hidden={!revealed}
                    className={cn(
                        "grid grid-cols-3 gap-2 transition-[filter] duration-300",
                        !revealed && "pointer-events-none select-none blur-md",
                    )}
                >
                    {words.map((word, index) => (
                        <Squircle asChild radius={12} key={index}>
                            <div className="flex items-center gap-1.5 bg-white/[0.06] px-2.5 py-2.5">
                                <span className="w-5 shrink-0 text-right text-[11px] font-medium tabular-nums text-zinc-600">{index + 1}</span>
                                <span className="truncate text-[13px] font-semibold text-white">{revealed ? word : "•••••"}</span>
                            </div>
                        </Squircle>
                    ))}
                </div>

                {!revealed ? (
                    <div className="absolute inset-0 grid place-items-center">
                        <button
                            onClick={() => setRevealed(true)}
                            className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-[13px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.97]"
                        >
                            <HugeiconsIcon icon={ViewIcon} className="size-4" strokeWidth={2} />
                            Reveal phrase
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setRevealed(false)}
                        aria-label="Hide phrase"
                        className="absolute -right-1.5 -top-1.5 grid size-8 cursor-pointer place-items-center rounded-full bg-zinc-900 text-zinc-400 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={ViewOffSlashIcon} className="size-4" strokeWidth={2} />
                    </button>
                )}
            </div>

            {/* Copy / download — locked until revealed */}
            <div className="flex gap-2">
                <button
                    onClick={handleCopy}
                    disabled={!revealed}
                    className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-white/5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className={cn("size-4", copied && "text-white")} strokeWidth={2} />
                    {copied ? "Copied" : "Copy"}
                </button>
                <button
                    onClick={handleDownload}
                    disabled={!revealed}
                    className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-white/5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                >
                    <HugeiconsIcon icon={Download01Icon} className="size-4" strokeWidth={2} />
                    Download
                </button>
            </div>

            {/* Confirmation */}
            {showConfirmation && (
                <div className="space-y-3">
                    <Squircle asChild radius={16} autoEffects={false}>
                        <label htmlFor="confirm-saved" className="flex cursor-pointer items-start gap-3 bg-white/[0.04] p-4">
                            <input
                                type="checkbox"
                                id="confirm-saved"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-white"
                            />
                            <span className="text-[13px] font-medium leading-relaxed text-zinc-300">
                                I wrote down my recovery phrase and stored it somewhere safe. If I lose it, I lose the wallet — forever.
                            </span>
                        </label>
                    </Squircle>

                    <button
                        onClick={handleConfirmClick}
                        disabled={!confirmed}
                        className="h-20 w-full cursor-pointer rounded-full bg-white text-[16px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                    >
                        I saved my phrase
                    </button>
                </div>
            )}
        </div>
    );
}
