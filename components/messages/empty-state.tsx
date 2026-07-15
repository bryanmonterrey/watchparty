'use client';

import { MessagesIcon } from '@/components/icons';

export function EmptyState() {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-5 text-center">
                <div className="grid size-16 place-items-center rounded-full bg-white/5">
                    <MessagesIcon className="size-7 text-zinc-500" />
                </div>
                <div className="space-y-1.5">
                    <h2 className="text-[20px] font-bold tracking-tight text-white">Your messages</h2>
                    <p className="max-w-[260px] text-[13px] font-medium leading-relaxed text-zinc-500">
                        Pick a conversation, or start a new one from the list.
                    </p>
                </div>
            </div>
        </div>
    );
}
