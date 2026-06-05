'use client';

import { MessagesIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';

export function EmptyState() {
    return (
        <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center">
                {/* Message Icon */}
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/10">
                    <MessagesIcon className="h-12 w-12 text-white/60" />
                </div>
                {/* Text */}
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold text-white">Your messages</h2>
                    <p className="text-sm text-white/60">Send a message to start a chat.</p>
                </div>
                {/* CTA Button */}
                <Button
                    className="bg-white/90 hover:bg-white text-black font-bold rounded-full px-6"
                >
                    Send message
                </Button>
            </div>
        </div>
    );
}
