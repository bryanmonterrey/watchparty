"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { DraftCard } from "../types";
import { CARD_TRANSITION, cardVariants } from "./constants";


function VideoPlaceholderIcon() {
    return (
        <svg viewBox="0 0 24 24" className="size-7 text-zinc-600 fill-current">
            <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
        </svg>
    );
}

// ── Shared card shell ────────────────────────────────────────────────────
// Layout: "From X" header | full-width thumbnail | title + gear

function CardShell({ creatorName, onCollapse, thumbnail, title, onNavigate }: {
    creatorName?: string;
    onCollapse: () => void;
    thumbnail: React.ReactNode;
    title: string;
    onNavigate?: () => void;
}) {
    return (
        <>
            <div className="flex items-center justify-between px-3 pt-2.5 pb-2 flex-shrink-0">
                {creatorName && (
                    <span className="text-white text-sm font-semibold truncate">From {creatorName}</span>
                )}
                <button
                    onClick={(e) => { e.stopPropagation(); onCollapse(); }}
                    className="ml-auto cursor-pointer rounded-full hover:bg-white/10 p-1 flex-shrink-0 text-zinc-400 hover:text-white transition-colors"
                >
                    <X className="size-5" />
                </button>
            </div>

            <div
                onClick={onNavigate}
                className={onNavigate ? "cursor-pointer" : undefined}
            >
                <div className="relative w-full aspect-video bg-zinc-800 flex-shrink-0 overflow-hidden">
                    {thumbnail}
                </div>

                <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                    <p className="text-white text-sm font-medium leading-snug line-clamp-2 flex-1 min-w-0">
                        {title}
                    </p>
                </div>
            </div>
        </>
    );
}

// ── Per-type card content ─────────────────────────────────────────────────

function VideoCard({ card, creatorName, onCollapse, onNavigate }: { card: DraftCard; creatorName?: string; onCollapse: () => void; onNavigate?: () => void }) {
    return (
        <CardShell
            creatorName={creatorName}
            onCollapse={onCollapse}
            onNavigate={onNavigate}
            title={card.title || "Video"}
            thumbnail={
                card.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.thumbnailUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                        <VideoPlaceholderIcon />
                    </div>
                )
            }
        />
    );
}

function PlaylistCard({ card, creatorName, onCollapse, onNavigate }: { card: DraftCard; creatorName?: string; onCollapse: () => void; onNavigate?: () => void }) {
    return (
        <CardShell
            creatorName={creatorName}
            onCollapse={onCollapse}
            onNavigate={onNavigate}
            title={card.title || "Playlist"}
            thumbnail={
                <>
                    <div className="absolute inset-y-0 right-0 w-[92%] bg-zinc-600" />
                    <div className="absolute inset-y-0 right-0 w-[96%] bg-zinc-700" />
                    <div className="absolute inset-y-0 right-0 w-full bg-zinc-800 flex items-center justify-center">
                        <svg viewBox="0 0 24 24" className="size-8 text-zinc-500 fill-current">
                            <path d="M4 6h16v2H4zm2-4h12v2H6zm14 8H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2zm-8 7.5v-5l4 2.5-4 2.5z" />
                        </svg>
                    </div>
                    <div className="absolute bottom-1.5 right-2 bg-black/70 rounded px-1.5 py-0.5 text-[9px] text-white font-semibold tracking-wide">
                        PLAYLIST
                    </div>
                </>
            }
        />
    );
}

function ChannelCard({ card, creatorName, onCollapse, onNavigate }: { card: DraftCard; creatorName?: string; onCollapse: () => void; onNavigate?: () => void }) {
    const name = card.title || "Channel";
    return (
        <CardShell
            creatorName={creatorName}
            onCollapse={onCollapse}
            onNavigate={onNavigate}
            title={name}
            thumbnail={
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                    {card.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.thumbnailUrl} alt={name} className="w-16 h-16 rounded-full object-cover" />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center text-2xl font-bold text-white">
                            {name[0]?.toUpperCase()}
                        </div>
                    )}
                </div>
            }
        />
    );
}

function LinkCard({ card, creatorName, onCollapse, onNavigate }: { card: DraftCard; creatorName?: string; onCollapse: () => void; onNavigate?: () => void }) {
    let hostname = "";
    try { if (card.url) hostname = new URL(card.url).hostname.replace("www.", ""); } catch {}
    return (
        <CardShell
            creatorName={creatorName}
            onCollapse={onCollapse}
            onNavigate={onNavigate}
            title={card.title || hostname || "Link"}
            thumbnail={
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                    <svg viewBox="0 0 24 24" className="size-8 text-zinc-600 fill-current">
                        <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                    </svg>
                </div>
            }
        />
    );
}

// ── Expanded card wrapper (animation + type dispatch) ─────────────────────

export function ExpandedCard({ card, creatorName, onCollapse }: { card: DraftCard; creatorName?: string; onCollapse: () => void }) {
    const router = useRouter();

    const handleNavigate = useCallback(() => {
        if (!card.url) return;
        if (card.url.startsWith("/")) {
            router.push(card.url);
        } else if (card.url.startsWith("http")) {
            window.open(card.url, "_blank", "noopener,noreferrer");
        }
    }, [card.url, router]);

    const navigate = card.url ? handleNavigate : undefined;

    const content = (() => {
        switch (card.type) {
            case "playlist": return <PlaylistCard card={card} creatorName={creatorName} onCollapse={onCollapse} onNavigate={navigate} />;
            case "channel":  return <ChannelCard  card={card} creatorName={creatorName} onCollapse={onCollapse} onNavigate={navigate} />;
            case "link":     return <LinkCard     card={card} creatorName={creatorName} onCollapse={onCollapse} onNavigate={navigate} />;
            default:         return <VideoCard    card={card} creatorName={creatorName} onCollapse={onCollapse} onNavigate={navigate} />;
        }
    })();

    return (
        <motion.div
            key={card.id}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={CARD_TRANSITION}
            className="w-52 bg-black/50 inset-y-0 backdrop-blur-md shadow-2xl overflow-hidden pointer-events-auto flex flex-col"
            style={{ originX: 1 }}
        >
            {content}
        </motion.div>
    );
}
