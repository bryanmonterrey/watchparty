"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { motion } from "motion/react";
import { ViewOffIcon, FlagIcon, LinkIcon } from "@/components/icons";
import { NFT } from "../../types";

interface MoreActionsOverlayProps {
    nft: NFT;
    onClose: () => void;
    onHideCollections?: () => void;
    onReportSpam?: (nft: NFT) => void;
}

export function MoreActionsOverlay({ nft, onClose, onHideCollections, onReportSpam }: MoreActionsOverlayProps) {
    return (
        <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 flex flex-col bg-canvas"
        >
            {/* No border-b — the drawer separates by spacing, not hairlines. */}
            <div className="relative flex h-14 items-center justify-center px-3">
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute left-3 grid size-9 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-95"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
                </button>
                <h2 className="truncate px-12 text-16 font-bold tracking-tight text-white">{nft.name}</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 flex flex-col pt-6">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => {
                            onClose();
                            onHideCollections?.();
                        }}
                        className="flex cursor-pointer items-center gap-3 rounded-3xl border border-baseborder/20 bg-panel2 px-4 py-3.5 text-white transition-colors hover:bg-white/[0.05]"
                    >
                        <ViewOffIcon className="size-5" />
                        <span className="text-15 font-bold tracking-tight">Hide collection</span>
                    </button>
                    <button
                        onClick={() => {
                            onReportSpam?.(nft);
                            onClose();
                        }}
                        className="flex cursor-pointer items-center gap-3 rounded-3xl border border-baseborder/20 bg-panel2 px-4 py-3.5 text-pastelred transition-colors hover:bg-pastelred/10"
                    >
                        <FlagIcon className="size-5" />
                        <span className="text-15 font-bold tracking-tight">Report as spam</span>
                    </button>
                    <button
                        onClick={() => {
                            window.open(`https://orbmarkets.io/token/${nft.mint}`, "_blank", "noopener,noreferrer");
                            onClose();
                        }}
                        className="flex cursor-pointer items-center gap-3 rounded-3xl border border-baseborder/20 bg-panel2 px-4 py-3.5 text-white transition-colors hover:bg-white/[0.05]"
                    >
                        <LinkIcon className="size-5" />
                        <span className="text-15 font-bold tracking-tight">View on Orb</span>
                    </button>
                </div>
            </div>

            <div className="relative z-10 bg-canvas p-4 pb-8">
                <button
                    onClick={onClose}
                    className="h-12 w-full cursor-pointer rounded-full bg-white/[0.08] text-15 font-bold text-white transition-colors hover:bg-white/[0.14] active:scale-[0.99]"
                >
                    Close
                </button>
            </div>
        </motion.div>
    );
}
