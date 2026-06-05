'use client';

import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { useTheme } from 'next-themes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';

interface EmojiPickerProps {
    onEmojiSelect: (emoji: { native: string }) => void;
    className?: string;
    iconClassName?: string;
    children?: React.ReactNode;
}

export function EmojiPicker({ onEmojiSelect, className, iconClassName, children }: EmojiPickerProps) {
    const { resolvedTheme } = useTheme();
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light'; // Fallback logic

    return (
        <Popover>
            <PopoverTrigger asChild>
                {children ? (
                    children
                ) : (
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                            "h-6 w-6 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700/50",
                            className
                        )}
                    >
                        <Smile className={cn("h-4 w-4", iconClassName)} />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent 
                className="w-[319px] p-0 border-flexborder/75 bg-neutral-950 shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 overflow-visible rounded-3xl z-50 transition-all duration-200" 
                side="top" 
                align="start"
                sideOffset={12}
                onInteractOutside={(e) => {
                    // Prevent closing when clicking the emoji picker web component
                    // which often doesn't trigger standard "inside click" logic in Radix
                    if ((e.target as HTMLElement)?.tagName?.toLowerCase() === 'em-emoji-picker') {
                        e.preventDefault();
                    }
                }}
            >
                <div
                    className="relative z-50 w-full h-[435px] overflow-y-auto text-sm rounded-3xl"
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                >
                    <style dangerouslySetInnerHTML={{ __html: `
                        em-emoji-picker {
                            --rgb-background: 10, 10, 10;
                            --rgb-input: 20, 20, 20;
                            --border-radius: 28px;
                            --category-icon-size: 20px;
                            --font-size: 16px;
                            --input-padding: 12px 16px;
                            --input-border-radius: 99px;
                            width: 100%;
                            height: 100%;
                            display: block;
                        }
                    `}} />
                    <Picker
                        data={data}
                        onEmojiSelect={onEmojiSelect}
                        theme="dark"
                        previewPosition="none"
                        skinTonePosition="none"
                        searchPosition="sticky"
                        navPosition="top"
                        perLine={8}
                        autoFocus={true}
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
