'use client';

import { useMemo } from 'react';
import { SolanaIcon } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useChat } from './chat-context';
import { useTray } from '@/components/providers/tray-provider';

interface TransactionBubbleProps {
    content: string; // JSON string
    isMe: boolean;
    type: 'transaction_send' | 'transaction_request';
    containerClassName?: string;
}

export function TransactionBubble({ content, isMe, type, containerClassName }: TransactionBubbleProps) {
    const { openTray } = useTray();

    const data = useMemo(() => {
        try {
            return JSON.parse(content);
        } catch (e) {
            console.error('Failed to parse transaction content', e);
            return null;
        }
    }, [content]);

    if (!data) {
        return (
            <div className={cn("p-3 rounded-lg bg-red-500/10 text-red-500 text-sm", containerClassName)}>
                Invalid transaction data
            </div>
        );
    }

    const { amount } = data;
    const isSend = type === 'transaction_send';

    return (
        <div className={cn(
            "flex flex-col relative overflow-hidden bg-black text-white rounded-[1.25rem] p-4 min-w-[200px] border border-zinc-800/50 shadow-sm select-none",
            containerClassName
        )}>
            {/* Header */}
            <div className="flex items-center gap-1.5 opacity-90 mb-6">
                <SolanaIcon className="size-3.5 text-white" />
                <span className="text-[11px] font-medium leading-none mt-0.5">Solana</span>
            </div>

            {/* Content */}
            <div className="flex flex-col items-center justify-center gap-1 mb-2">
                <div className="flex items-baseline justify-center w-full text-center">
                    <span className="text-4xl font-medium tracking-tight h-[42px] flex items-center">
                        $ {amount}
                    </span>
                </div>
                {!isSend && (
                    <span className="text-sm font-medium text-zinc-400">
                        {isMe ? 'Request sent' : 'Request'}
                    </span>
                )}
            </div>

            {/* Actions (Only for received requests) */}
            {!isSend && !isMe && (
                <div className="mt-4 w-full">
                    <button
                        onClick={() => openTray('send')}
                        className="w-full flex items-center justify-center h-10 bg-white text-black text-sm font-bold rounded-full hover:bg-zinc-200 active:scale-95 transition-all"
                    >
                        Pay
                    </button>
                </div>
            )}

            {/* Sent Status */}
        </div>
    );
}
