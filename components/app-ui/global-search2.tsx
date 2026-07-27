"use client";

import React, { useState, useEffect, useRef, ViewTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, AudioWavesIcon, ArrowRightIcon } from "@/components/icons";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { SearchDropdown } from "@/components/home/video-feed/search-dropdown";
import { useSearchHistory } from "@/hooks/use-search-history";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
    initialValue?: string;
    placeholder?: string;
    className?: string;
    onSearch?: (value: string) => void;
    showDropdown?: boolean;
    autoFocus?: boolean;
}

export function GlobalSearch({ 
    initialValue = "", 
    placeholder = "Search", 
    className, 
    onSearch,
    showDropdown = true,
    autoFocus = false
}: GlobalSearchProps) {
    const [inputValue, setInputValue] = useState(initialValue);
    const [isFocused, setIsFocused] = useState(false);
    const { history, addToHistory, removeFromHistory } = useSearchHistory();
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync external value changes
    useEffect(() => {
        setInputValue(initialValue);
    }, [initialValue]);

    // Clear the active state on any click outside the search container.
    // isFocused previously only reset on submit / dropdown close, so with
    // showDropdown=false (the /search page) the focus ring stuck on forever.
    useEffect(() => {
        if (!isFocused) return;
        const onPointerDown = (e: PointerEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [isFocused]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        const trimmed = inputValue.trim();
        if (trimmed) {
            addToHistory(trimmed);
            if (onSearch) {
                onSearch(trimmed);
            } else {
                router.push(`/search?q=${encodeURIComponent(trimmed)}`);
            }
            setIsFocused(false);
        }
    };

    const handleClear = () => {
        setInputValue("");
        if (onSearch) onSearch("");
    };

    return (
        <div ref={containerRef} className={cn("relative w-full max-w-[600px]", className)}>
            <ViewTransition name="search-bar">
            <form
                onSubmit={handleSubmit}
                className={cn(
                    // z-50 keeps the bar above the attached suggestion panel
                    // (docs/searchbar.svg: the panel wraps the bar at a 2px
                    // inset and renders behind it).
                    "relative z-50 h-[52px] backdrop-blur-xl inner-shadow hover:cursor-pointer inner-shadow-blur-sm inner-shadow-white/50 cursor-pointer flex items-center bg-sidebar-hover-40 hover:bg-soft-gray-10/50 rounded-full border-sidebar-hover/10 border transition-colors",
                    // Single source of truth for the ring: isFocused (set on
                    // input focus, cleared on submit / outside click). No ring
                    // while the panel is showing — it would sit inside the
                    // panel's 2px inset and read as a double border.
                    isFocused && !(showDropdown && (inputValue.length > 0 || history.length > 0)) && "ring-2 ring-white/35"
                )}
            >
                <SearchIcon className="absolute left-4 size-6 text-flexwhite/50" />
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => {
                        setInputValue(e.target.value);
                        if (onSearch) onSearch(e.target.value);
                    }}
                    onFocus={() => setIsFocused(true)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    className="w-full bg-transparent pl-12.5 pr-20 py-2.5 text-lg font-medium text-white placeholder:text-flexwhite/50 hover:cursor-pointer active:cursor-text focus-visible:cursor-text focus-within:cursor-text focus:outline-none"
                />
                <div className="absolute right-3 flex items-center gap-1">
                    <AnimatePresence>
                        {inputValue.length > 0 && (
                            <motion.button
                                key="clear"
                                type="button"
                                onClick={handleClear}
                                initial={{ opacity: 1, scale: 1 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1 }}
                                transition={{ duration: 0.125 }}
                                className="p-1.5 cursor-pointer rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                    <button type="submit" className="p-1.5 rounded-full text-white/15 hover:text-white hover:bg-white/5 cursor-pointer transition-colors">
                        <AnimatePresence mode="wait">
                            {inputValue.length > 0 ? (
                                <motion.span key="arrow" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 1, scale: 1 }} transition={{ duration: 0.125 }}>
                                    <ArrowRightIcon className="w-6 h-6" />
                                </motion.span>
                            ) : (
                                <motion.span key="live" initial={{ opacity: 1, scale: 1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 1, scale: 1 }} transition={{ duration: 0.125 }}>
                                    <AudioWavesIcon className="w-6 h-6" />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </button>
                </div>
            </form>
            </ViewTransition>

            {showDropdown && isFocused && (
                <SearchDropdown
                    query={inputValue}
                    onClose={() => setIsFocused(false)}
                    history={history}
                    onRemoveHistory={removeFromHistory}
                    onSelectHistory={(val) => {
                        setInputValue(val);
                        addToHistory(val);
                        if (onSearch) {
                            onSearch(val);
                        } else {
                            router.push(`/search?q=${encodeURIComponent(val)}`);
                        }
                        setIsFocused(false);
                    }}
                    onAddHistory={addToHistory}
                />
            )}
        </div>
    );
}
