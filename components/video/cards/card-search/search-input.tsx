"use client";

import { Search } from "lucide-react";

interface SearchInputProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    className?: string;
}

export function SearchInput({
    value,
    onChange,
    placeholder = "Search...",
    autoFocus,
    className = "",
}: SearchInputProps) {
    return (
        <div className={`flex h-[52px] items-center gap-2.5 px-4 border-b border-flexborder/60 ${className}`}>
            <Search className="size-4 text-zinc-500 flex-shrink-0" strokeWidth={1.5} />
            <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
                className="flex-1 bg-transparent outline-none text-[14px] text-zinc-200 placeholder:text-zinc-500"
            />
        </div>
    );
}
