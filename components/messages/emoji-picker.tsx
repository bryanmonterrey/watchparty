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
    /**
     * Fires when the picker opens or closes. Optional, so every existing
     * uncontrolled caller is unaffected.
     *
     * A hover-revealed trigger needs this: without it the owner can't know the
     * picker is open, so moving the pointer off the row hides the trigger and
     * takes the open picker with it — you can never reach the emoji you were
     * aiming at.
     */
    onOpenChange?: (open: boolean) => void;
}

export function EmojiPicker({ onEmojiSelect, className, iconClassName, children, onOpenChange }: EmojiPickerProps) {
    const { resolvedTheme } = useTheme();
    const theme = resolvedTheme === 'dark' ? 'dark' : 'light'; // Fallback logic

    return (
        <Popover onOpenChange={onOpenChange}>
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
                // `align="start"` pinned the picker's LEFT edge to the
                // trigger's left edge, so a 319px panel opened from a
                // right-hand trigger (the message hover toolbar, a right-
                // aligned DM bubble) overflowed the viewport and Radix shifted
                // it bodily left — landing it far from the button that opened
                // it. `center` keeps it anchored under its trigger and makes
                // any collision correction symmetric and small.
                align="center"
                sideOffset={12}
                // Without this the panel sits flush against the viewport edge
                // (measured: right = 1440 on a 1440px viewport, zero gutter).
                // Also keeps the 435px-tall panel off the top edge on short
                // windows.
                collisionPadding={12}
                onInteractOutside={(e) => {
                    // Prevent closing when clicking the emoji picker web component
                    // which often doesn't trigger standard "inside click" logic in Radix
                    if ((e.target as HTMLElement)?.tagName?.toLowerCase() === 'em-emoji-picker') {
                        e.preventDefault();
                    }
                }}
            >
                <div
                    // Height is capped to the viewport, not fixed. At 435px flat
                    // the panel is simply taller than the space above its
                    // trigger on a short window (measured: top = -35px on a
                    // 600px-tall viewport), and no amount of collision padding
                    // can fit a box that doesn't fit — Radix can only shift it,
                    // so it hung off the top edge.
                    className="relative z-50 w-full h-[min(435px,60vh)] overflow-y-auto text-sm rounded-3xl"
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
