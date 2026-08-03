"use client";

import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { GlobalSearch } from "@/components/app-ui/global-search2";

interface SearchHeaderProps {
    value: string;
    onChange: (value: string) => void;
    onBack: () => void;
    placeholder?: string;
}

// /feed/search's header. The bar is THE GLOBAL SEARCH COMPONENT, not a copy of
// its styling — this used to be a hand-rolled input (h-[52px], bg-zinc-500/35,
// text-[18px], a paramount focus ring) that had drifted into looking like a
// different control from the one in the app header. Reusing it is the only way
// the two stay identical, and it brings the header bar's behaviour with it:
// search history, the clear button, the submit affordance, the focus ring.
//
// showDropdown={false} because this page renders its results below the bar; the
// suggestion panel would cover them. GlobalSearch supports that case directly
// (it resets its own focus ring on outside click when the panel is off).
//
// onSearch fires on every keystroke AND on submit AND on clear, which is
// exactly the contract `onChange` wants — so there's no separate clear handler
// here any more.
export function SearchHeader({ value, onChange, onBack, placeholder = "Search" }: SearchHeaderProps) {
    return (
        <div className="sticky top-0 z-[100] flex h-13 w-full items-center justify-between gap-3 bg-canvas/60 backdrop-blur-xl">
            <button
                onClick={onBack}
                className="h-13 hover:bg-white/10 px-4 transition-colors cursor-pointer text-zinc-100"
            >
                <ChevronLeft className="w-7 h-7" />
            </button>

            {/* flex-1 merges onto GlobalSearch's own `w-full max-w-[600px]`, so
                the bar fills the gap between the two buttons but still stops at
                the same 600px the header's copy does. */}
            <GlobalSearch
                initialValue={value}
                onSearch={onChange}
                placeholder={placeholder}
                showDropdown={false}
                autoFocus
                className="flex-1"
            />

            <div className="relative flex items-center justify-center gap-1">
                <button className="p-2 px-4 h-13 hover:bg-white/10 transition-colors cursor-pointer text-zinc-100">
                    <MoreHorizontal className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
