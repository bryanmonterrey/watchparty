"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

interface CollectionSearchProps {
    value: string;
    onChange: (value: string) => void;
}

export function CollectionSearch({ value, onChange }: CollectionSearchProps) {
    return (
        <div className="p-4 pt-2">
            <div className="relative group">
                <HugeiconsIcon icon={Search01Icon} className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-white" />
                <input
                    type="text"
                    placeholder="Search"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-[52px] w-full rounded-full border-none bg-white/[0.06] pl-12 pr-4 text-15 font-medium text-white transition-colors placeholder:text-zinc-400 focus:bg-white/[0.09] focus:outline-none"
                />
            </div>
        </div>
    );
}
