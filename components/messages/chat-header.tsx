"use client";

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VideoIcon, InfoIcon } from '@/components/icons';
import { trpc } from '@/lib/trpc/client';
import { useMessagesContext } from './messages-provider';
import { ChevronRight } from 'lucide-react';

interface ChatHeaderProps {
    conversationId: string;
}

export function ChatHeader({ conversationId }: ChatHeaderProps) {
    // Fetch conversation participants
    const { data: participantsData, isLoading } = trpc.conversation.getParticipants.useQuery({
        conversationId,
    });

    const participant = participantsData?.participants?.[0];
    const { onlineUsers } = useMessagesContext();
    const isOnline = participant?.userId ? onlineUsers.includes(participant.userId) : false;

    if (isLoading || !participant) {
        return (
            <div className="h-[64px] flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full shimmer-skeleton" />
                    <div className="space-y-1.5">
                        <div className="shimmer-skeleton h-4 w-32 rounded-full" />
                        <div className="shimmer-skeleton h-3 w-20 rounded-full opacity-50" />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="shimmer-skeleton size-9 rounded-full" />
                    <div className="shimmer-skeleton size-9 rounded-full" />
                    <div className="shimmer-skeleton size-9 rounded-full" />
                </div>
            </div>
        );
    }

    return (
        <div className="h-[64px] cursor-pointer hover:bg-zinc-900 flex items-center justify-center px-6 shrink-0 bg-background/40 backdrop-blur-xl z-10">
            {/* User Info */}
            <div className="flex items-center gap-3">
                <div className="relative">
                    <Avatar className="h-10 w-10 border border-white/5">
                        <AvatarImage src={participant.avatar_url || undefined} alt={participant.name || ""} />
                        <AvatarFallback className="bg-zinc-800 text-white">
                            {(participant.name || "?")[0]}
                        </AvatarFallback>
                    </Avatar>
                    {isOnline && (
                        <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black bg-green-500" />
                    )}
                </div>
                <div className="flex flex-col">
                    <h2 className="font-bold text-[15px] text-white leading-tight">{participant.name}</h2>
                    <p className="text-xs font-medium text-white/50">
                        {isOnline ? 'Online' : `@${participant.username || 'user'}`}
                    </p>
                </div>
                <div className='cursor-pointer flex text-white/70 hover:text-white hover:bg-white/5 p-2 rounded-full'>
                    <ChevronRight className="size-6" />
                </div>
            </div>
        </div>
    );
}
