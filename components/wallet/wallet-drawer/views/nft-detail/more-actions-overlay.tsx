"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
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
            className="absolute inset-0 z-50 bg-[#0A0A0A] rounded-t-2xl flex flex-col"
        >
            <div className="flex items-center justify-center p-4 relative border-b border-white/5">
                <button
                    onClick={onClose}
                    className="absolute left-4 p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5 text-white/70" />
                </button>
                <h2 className="text-[17px] font-bold text-white">{nft.name}</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 flex flex-col pt-6">
                <div className="bg-[#1C1C1E] rounded-[20px] overflow-hidden flex flex-col border border-white/5">
                    <button
                        onClick={() => {
                            onClose();
                            onHideCollections?.();
                        }}
                        className="flex items-center gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors text-white cursor-pointer"
                    >
                        <ViewOffIcon className="w-5 h-5" />
                        <span className="text-[17px] font-medium">Hide Collection</span>
                    </button>
                    <button
                        onClick={() => {
                            onReportSpam?.(nft);
                            onClose();
                        }}
                        className="flex items-center gap-3 p-4 border-b border-white/5 hover:bg-white/5 transition-colors text-[#FF453A] cursor-pointer"
                    >
                        <FlagIcon className="w-5 h-5" />
                        <span className="text-[17px] font-medium">Report as Spam</span>
                    </button>
                    <button
                        onClick={() => {
                            window.open(`https://orbmarkets.io/token/${nft.mint}`, "_blank", "noopener,noreferrer");
                            onClose();
                        }}
                        className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-white cursor-pointer"
                    >
                        <LinkIcon className="w-5 h-5" />
                        <span className="text-[17px] font-medium">View on Orb</span>
                    </button>
                </div>
            </div>

            <div className="p-4 border-t border-white/5 pb-8 relative z-10 bg-[#0A0A0A] rounded-b-2xl">
                <button
                    onClick={onClose}
                    className="bg-[#1C1C1E] rounded-full p-4 text-[17px] font-semibold text-white hover:bg-white/5 transition-colors w-full cursor-pointer border border-white/5 shadow-sm"
                >
                    Close
                </button>
            </div>
        </motion.div>
    );
}
