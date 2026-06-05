'use client';

import { useRef } from 'react';
import { ArrowUpRightIcon, ArrowDownLeftIcon, VideoIcon, ClipIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useChat } from './chat-context';
import { useTray } from '@/components/providers/tray-provider';

export function ChatSidebarActions() {
    const { setAttachment } = useChat();
    const { openTray } = useTray();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachment(file);
        }
        // Reset input to allow selecting the same file again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="col-span-1 pt-7 flex-shrink-0 h-full flex flex-col gap-1 items-center justify-center rounded-2xl">
            {/* Hidden File Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Send Action */}
            <div
                className=" border border-white/10 h-[175px] w-full rounded-3xl flex flex-col items-center justify-center gap-2 group hover:bg-zinc-600/10 transition-colors cursor-pointer"
                onClick={() => openTray('send')}
            >
                <Button variant="ghost" size="icon" className="h-16 w-16 rounded-full bg-zinc-800/10 group-hover:bg-zinc-800 transition-colors pointer-events-none">
                    <ArrowUpRightIcon className="size-8 text-white/80 group-hover:text-white/85" width={32} height={32} />
                </Button>
                <span className="text-xs font-medium text-white/80  group-hover:text-white/85 transition-colors">Send</span>
            </div>

            {/* Request Action */}
            <div
                className=" border border-white/10 h-[175px] w-full rounded-3xl flex flex-col items-center justify-center gap-2 group hover:bg-zinc-600/10 transition-colors cursor-pointer"
                onClick={() => openTray('request')}
            >
                <Button variant="ghost" size="icon" className="h-16 w-16 rounded-full bg-zinc-800/10 group-hover:bg-zinc-800 transition-colors pointer-events-none">
                    <ArrowDownLeftIcon className="size-8 text-white/80 group-hover:text-white/85" width={32} height={32} />
                </Button>
                <span className="text-xs font-medium text-white/80 group-hover:text-white/85 transition-colors">Request</span>
            </div>

            {/* Video Call Action */}
            <div className=" border border-white/10 h-[175px] w-full rounded-3xl flex flex-col items-center justify-center gap-2 group hover:bg-zinc-600/10 transition-colors cursor-pointer">
                <Button variant="ghost" size="icon" className="h-16 w-16 rounded-full bg-zinc-800/10 group-hover:bg-zinc-800 transition-colors pointer-events-none">
                    <VideoIcon className="size-8 text-white/80 group-hover:text-white/85" width={32} height={32} />
                </Button>
                <span className="text-xs font-medium text-white/80 group-hover:text-white/85 transition-colors">Video Call</span>
            </div>

            {/* Attach Action */}
            <div
                className=" border border-white/10 h-[175px] w-full rounded-3xl flex flex-col items-center justify-center gap-2 group hover:bg-zinc-600/10 transition-colors cursor-pointer"
                onClick={handleAttachClick}
            >
                <Button variant="ghost" size="icon" className="h-16 w-16 rounded-full bg-zinc-800/10 group-hover:bg-zinc-800 transition-colors pointer-events-none">
                    <ClipIcon className="size-8 text-white/80 group-hover:text-white/85" width={32} height={32} />
                </Button>
                <span className="text-xs font-medium text-white/80 group-hover:text-white/85 transition-colors">Attach</span>
            </div>
        </div>
    );
}

