'use client';

import { cn } from '@/lib/utils';
import { MessageActions } from './message-actions';
import { PlayIcon, PauseIcon } from '@/components/icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { CornerUpLeftIcon } from '@hugeicons/core-free-icons';
import { Check, CheckCheck } from 'lucide-react';
import { TransactionBubble } from './transaction-bubble';
import { AudioMessagePlayer } from './audio-message-player';
import { EmoteText } from "@/components/emoji/emote-text";

interface Reaction {
    id: string;
    emoji: string;
    userId: string;
    messageId: string;
}

interface ReadReceipt {
    id: string;
    userId: string;
    messageId: string;
    readAt: string;
}

interface Message {
    id: string;
    senderId: string;
    content: string;
    encryptionIv: string;
    messageType?: string;
    createdAt: string;
    isEncrypted: boolean;
    reactions?: Reaction[];
    readReceipts?: ReadReceipt[];
    attachmentUrl?: string | null;
    replyToMessage?: {
        id: string;
        content: string;
        senderId: string;
        messageType?: string;
        attachmentUrl?: string | null;
    } | null;
}

interface MessageBubbleProps {
    message: Message;
    isSent: boolean;
    onReact?: (emoji: string) => void;
    onReply?: (message: Message) => void;
    onImageLoad?: () => void;
    currentUserId?: string;
    isFirstInSequence?: boolean;
}

export function MessageBubble({ message, isSent, onReact, onReply, onImageLoad, currentUserId, isFirstInSequence = true }: MessageBubbleProps) {

    const formatTime = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Group reactions by emoji
    const reactionGroups = (message.reactions || []).reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {} as Record<string, Reaction[]>);

    // Simple regex for URLs (starts with http/https or www.)
    const linkify = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
        const parts = text.split(urlRegex);
        const matches: string[] = text.match(urlRegex) || [];

        return parts.map((part, i) => {
            if (!part) return null;
            if (matches.includes(part as string)) {
                const href = part.startsWith('www.') ? `https://${part}` : part;
                return (
                    <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-blue-300 break-all"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {part}
                    </a>
                );
            }
            // The non-link runs go through EmoteText so a `:code:` picked from
            // the emoji picker renders as its image rather than as literal
            // text. Links are left alone — a URL can contain a colon pair.
            return <span key={i}><EmoteText text={part as string} size={20} /></span>;
        });
    };

    const isTransaction = message.messageType === 'transaction_send' ||
        message.messageType === 'transaction_request' ||
        (message.content.startsWith('{') && message.content.includes('"amount"') && message.content.includes('"currency"'));

    const transactionType = message.messageType === 'transaction_send' || message.messageType === 'transaction_request'
        ? message.messageType
        : (message.content.includes('requesteeName') ? 'transaction_request' : 'transaction_send');

    return (
        <div
            className={cn(
                'flex flex-col group relative',
                isFirstInSequence ? 'mt-2' : 'mt-[2px]',
                isSent ? 'items-end' : 'items-start'
                // Removed centering override for transaction
            )}
        >
            <div className={cn(
                "flex items-end gap-1.5 max-w-[70%]",
                isSent ? 'flex-row-reverse' : 'flex-row'
                // Removed centering override for transaction
            )}>
                {/* Message Content Bubble */}
                <div
                    className={cn(
                        'rounded-2xl flex flex-wrap gap-x-3 items-end min-w-[80px]',
                        isTransaction
                            ? 'bg-transparent p-0'
                            : message.messageType === 'image'
                                ? 'bg-transparent p-0 border border-zinc-700/20' // Image handles its own styling
                                : (isSent ? 'bg-[#0095f6] text-white px-4 py-2' : 'bg-zinc-800 text-white px-4 py-2')
                    )}
                >
                    {isTransaction ? (
                        <div className="w-full">
                            <TransactionBubble
                                content={message.content}
                                isMe={isSent}
                                type={transactionType as 'transaction_send' | 'transaction_request'}
                            />
                            {/* Timestamp for transaction - Added mt-1 as requested */}
                            <div className="flex justify-end px-3 pb-2 mt-1">
                                <span className={cn("text-[10px] select-none", "text-zinc-500")}>
                                    {formatTime(message.createdAt)}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Quoted Reply Preview */}
                            {message.replyToMessage && (
                                <div
                                    className={cn(
                                        "mb-2 rounded-md p-2 text-xs border-l-2 cursor-pointer transition-colors relative overflow-hidden",
                                        "bg-black/10 hover:bg-black/20 dark:bg-white/5 dark:hover:bg-white/10",
                                        isSent ? "border-white/40" : "border-bleu/40"
                                    )}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const el = document.getElementById(`message-${message.replyToMessage?.id}`);
                                        if (el) {
                                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            // Highlight effect could be added here
                                        }
                                    }}
                                >
                                    <div className="font-semibold opacity-70 mb-0.5 flex items-center gap-1">
                                        <HugeiconsIcon icon={CornerUpLeftIcon} className="size-3" strokeWidth={2} />
                                        <span>Replying to {message.replyToMessage.senderId === currentUserId ? 'You' : 'User'}</span>
                                    </div>
                                    <div className="opacity-90 truncate max-w-[200px]">
                                        {message.replyToMessage.messageType === 'image' ? '📷 Image' :
                                            message.replyToMessage.messageType === 'audio' ? '🎤 Voice Message' :
                                                message.replyToMessage.messageType === 'file' ? '📄 File' :
                                                    message.replyToMessage.content}
                                    </div>
                                </div>
                            )}

                            {message.messageType === 'image' && message['attachmentUrl'] && (
                                <div className="rounded-2xl overflow-hidden relative group/image">
                                    <img
                                        src={message['attachmentUrl'] as string}
                                        alt="Attached image"
                                        className="max-w-full h-auto max-h-[300px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => window.open(message['attachmentUrl'] as string, '_blank')}
                                    />
                                    {/* Show caption if it's not the default fallback */}
                                    {message.content && message.content !== 'Sent an image' && (
                                        <div className={cn(
                                            "px-4 py-2 backdrop-blur-md",
                                            isSent ? "bg-[#0095f6]/80 text-white" : "bg-zinc-800/80 text-white"
                                        )}>
                                            <p className="text-sm whitespace-pre-wrap break-words">{linkify(message.content)}</p>
                                        </div>
                                    )}
                                    {/* Timestamp overlay for images without caption (or always) */}
                                    {(!message.content || message.content === 'Sent an image') && (
                                        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/40 backdrop-blur-sm">
                                            <span className="text-[10px] text-white/90 select-none">
                                                {formatTime(message.createdAt)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {message.messageType === 'audio' && message['attachmentUrl'] && (
                                <AudioMessagePlayer
                                    src={message['attachmentUrl'] as string}
                                    isSent={isSent}
                                />
                            )}

                            {message.messageType === 'file' && message['attachmentUrl'] && (
                                <div className="mb-1 p-3 bg-zinc-900/50 rounded-lg border border-zinc-700/50 flex items-center gap-3 cursor-pointer hover:bg-zinc-900 transition-colors"
                                    onClick={() => window.open(message['attachmentUrl'] as string, '_blank')}>
                                    <div className="bg-zinc-800 p-2 rounded-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                            <polyline points="14 2 14 8 20 8" />
                                        </svg>
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-medium text-zinc-200 truncate max-w-[150px]">
                                            {message['attachmentUrl'].split('/').pop()?.split('-').slice(2).join('-') || 'File'}
                                        </span>
                                        <span className="text-xs text-zinc-500">Click to download</span>
                                    </div>
                                </div>
                            )}
                            {/* Standard text message OR File caption (Image handled above because of edge-to-edge) */}
                            {message.messageType !== 'image' && message.messageType !== 'audio' && (
                                <p className="text-sm whitespace-pre-wrap break-words">
                                    {message.content !== 'Sent a file' && message.content !== 'Sent a voice message' && linkify(message.content)}
                                </p>
                            )}

                            {/* Restored Timestamp for non-image/audio messages */}
                            {message.messageType !== 'image' && message.messageType !== 'audio' && (
                                <span className={cn(
                                    "text-[10px] select-none ml-auto",
                                    isSent ? "text-blue-100" : "text-zinc-400"
                                )}>
                                    {formatTime(message.createdAt)}
                                </span>
                            )}
                        </>
                    )}
                </div>

                {/* Read Receipt & Reaction Trigger */}
                <div className={cn(
                    "flex flex-row gap-1 items-center self-end mb-1",
                    isTransaction && "self-center mb-0 translate-y-2" // Center vertically relative to bubble or just align better
                )}>
                    {/* Shared with community rows — same anatomy, same
                        frecency-ranked quick reactions, same keyboard and
                        touch behaviour. Replaces a bespoke cluster with six
                        hardcoded emoji that was mouse-only, and that stayed
                        clickable while invisible (opacity-0 with no
                        pointer-events guard). */}
                    {(onReact || onReply) && (
                        <MessageActions
                            align={isSent ? "right" : "left"}
                            onReact={(emoji) => onReact?.(emoji)}
                            onReply={() => onReply?.(message)}
                        />
                    )}

                    {/* Checkmark (Only for sent messages) */}
                    {isSent && (
                        <div className="w-4 h-4 flex items-center justify-center">
                            {message.readReceipts && message.readReceipts.length > 0 ? (
                                <CheckCheck className="size-3.5 text-[#0095f6]" />
                            ) : (
                                <Check className="size-3.5 text-zinc-500" />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Reactions Display */}
            {Object.keys(reactionGroups).length > 0 && (
                <div className={cn(
                    "flex gap-1 flex-wrap max-w-[70%]",
                    isTransaction ? "-mt-2" : "mt-1",
                    isSent ? "justify-end" : "justify-start"
                )}>
                    {Object.entries(reactionGroups).map(([emoji, reactions]) => {
                        const hasReacted = currentUserId ? reactions.some(r => r.userId === currentUserId) : false;
                        return (
                            <button
                                key={emoji}
                                onClick={() => onReact?.(emoji)}
                                className={cn(
                                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
                                    hasReacted
                                        ? "bg-bleu/20 border-bleu/50 text-blue-200"
                                        : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                                )}
                            >
                                <span>{emoji}</span>
                                <span className={cn("text-[10px]", hasReacted ? "text-blue-200" : "text-zinc-500")}>
                                    {reactions.length}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
