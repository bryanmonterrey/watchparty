'use client';

import { Drawer } from 'vaul';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { cn } from '@/lib/utils';

interface TrayProps {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger?: React.ReactNode;
    className?: string;
    title?: string;
    description?: string;
}

export function Tray({
    children,
    open,
    onOpenChange,
    trigger,
    className,
    title,
    description,
}: TrayProps) {
    return (
        <Drawer.Root open={open} onOpenChange={onOpenChange}>
            {trigger && <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>}
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
                <Drawer.Content
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    className={cn(
                        'bg-zinc-950 flex flex-col rounded-[2.25rem] fixed bottom-4 left-0 right-0 mx-auto z-50 border border-zinc-800 outline-none w-[361px] max-w-[95vw] overflow-hidden',
                        className
                    )}
                >
                    <div className="flex-1 bg-zinc-950">
                        <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-zinc-800 my-4" />
                        <div className="">
                            <div className="mb-0">
                                {title ? (
                                    <div className="mb-8 text-center">
                                        <Drawer.Title className="font-medium text-white mb-2 text-xl">
                                            {title}
                                        </Drawer.Title>
                                        {description && (
                                            <Drawer.Description className="text-zinc-500 text-sm">
                                                {description}
                                            </Drawer.Description>
                                        )}
                                    </div>
                                ) : (
                                    <VisuallyHidden>
                                        <Drawer.Title>Tray</Drawer.Title>
                                        <Drawer.Description>Tray Content</Drawer.Description>
                                    </VisuallyHidden>
                                )}
                            </div>
                            {children}
                        </div>
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}
