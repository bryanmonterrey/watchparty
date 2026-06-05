"use client";

import { Search } from "lucide-react";

interface TokenSearchProps {
    value: string;
    onChange: (value: string) => void;
}

export function TokenSearch({ value, onChange }: TokenSearchProps) {
    return (
        <div className="p-4 pt-2">
            <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-white transition-colors" />
                <input
                    type="text"
                    placeholder="Search..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-[#1C1C1E] border-none rounded-2xl py-4 pl-12 pr-4 text-[17px] text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/10 transition-all font-medium"
                />
            </div>
        </div>
    );
}
