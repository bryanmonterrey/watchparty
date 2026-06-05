"use client";

import { motion } from "motion/react";
import { VideoSearch } from "./video-search";
import { ChannelSearch } from "./channel-search";
import { PlaylistSearch } from "./playlist-search";
import type { CardType } from "../types";
import type { SearchSelectPayload } from "./types";

interface CardSearchProps {
    type: CardType;
    onClose: () => void;
    onSelect: (payload: SearchSelectPayload) => void;
}

export function CardSearch({ type, onClose, onSelect }: CardSearchProps) {
    return (
        <motion.div
            key="card-search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-[500] bg-[#0f0f0f] flex flex-col overflow-hidden"
        >
            {type === "video" && (
                <VideoSearch onClose={onClose} onSelect={onSelect} />
            )}
            {type === "channel" && (
                <ChannelSearch onClose={onClose} onSelect={onSelect} />
            )}
            {type === "playlist" && (
                <PlaylistSearch onClose={onClose} onSelect={onSelect} />
            )}
        </motion.div>
    );
}
