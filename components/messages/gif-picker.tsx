'use client';

import React, { useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Grid } from '@giphy/react-components';
import { useTheme } from 'next-themes';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { GifIcon } from '@/components/icons';
import { Search } from 'lucide-react';

// Use PUBLIC Beta Key if none provided in env
const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'sXpGFDGpz0Dv1SAMvyaFIcywG322Q4Wj';
const gf = new GiphyFetch(apiKey);

interface GifPickerProps {
    onGifSelect: (gifUrl: string) => void;
    className?: string;
    iconClassName?: string;
    children?: React.ReactNode;
}

export function GifPicker({ onGifSelect, className, iconClassName, children }: GifPickerProps) {
    const { resolvedTheme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');

    const fetchGifs = (offset: number) => {
        if (searchQuery) {
            return gf.search(searchQuery, { offset, limit: 10 });
        }
        return gf.trending({ offset, limit: 10 });
    };

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
                        <GifIcon className={cn("h-4 w-4", iconClassName)} />
                    </Button>
                )}
            </PopoverTrigger>
            <PopoverContent 
                className="w-[350px] p-0 border-flexborder/75 bg-neutral-950 shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 overflow-visible rounded-3xl z-50" 
                side="top" 
                align="start"
                sideOffset={12}
            >
                <div className="p-3 border-b border-white/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-postgray" />
                        <Input
                            placeholder="Search GIPHY..."
                            className="pl-9 bg-white/5 border-white/5 h-[52px] text-[16px] rounded-full focus:bg-white/10 transition-all placeholder:text-zinc-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div
                    className="h-[400px] w-full overflow-y-auto custom-scrollbar bg-neutral-950 p-1 rounded-b-3xl"
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                >
                    <Grid
                        key={searchQuery} // Forces re-render and re-fetch on search change
                        width={340}
                        columns={2}
                        fetchGifs={fetchGifs}
                        onGifClick={(gif, e) => {
                            e.preventDefault();
                            if (gif.images.original.url) {
                                onGifSelect(gif.images.original.url);
                            }
                        }}
                        noLink
                    />
                </div>
            </PopoverContent>
        </Popover>
    );
}
