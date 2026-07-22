"use client";

import { ChevronLeft, MoreHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { SearchIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface SearchHeaderProps {
    value: string;
    onChange: (value: string) => void;
    onBack: () => void;
    onClear: () => void;
    placeholder?: string;
}

export function SearchHeader({ value, onChange, onBack, onClear, placeholder = "Search" }: SearchHeaderProps) {
    return (
        <div className="flex w-full items-center justify-between h-13 bg-black/60 backdrop-blur-xl space-x-3 sticky top-0 z-[100]">
            <button
                onClick={onBack}
                className="h-13 hover:bg-white/10 px-4 transition-colors cursor-pointer text-zinc-100"
            >
                <ChevronLeft className="w-7 h-7" />
            </button>

            <div className="flex-1 mt-2">
                <div className={cn(
                    "relative flex h-[52px] items-center backdrop-blur-xl inner-shadow inner-shadow-blur-sm inner-shadow-white/50 bg-zinc-500/35 rounded-full transition-colors",
                    "focus-within:ring-2 focus-within:ring-paramount"
                )}>
                    <SearchIcon className="absolute left-4 w-[20px] h-[20px] text-zinc-400 pointer-events-none" />
                    <input
                        type="text"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        placeholder={placeholder}
                        autoFocus
                        className="w-full bg-transparent pl-11 pr-10 py-2.5 text-[18px] font-medium text-white placeholder:text-flexwhite/85 focus:outline-none"
                    />
                    <AnimatePresence>
                        {value.length > 0 && (
                            <motion.button
                                type="button"
                                onClick={onClear}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={{ duration: 0.125 }}
                                className="absolute right-3 p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </motion.button>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="relative flex items-center justify-center gap-1">
                <button className="p-2 px-4 h-13 hover:bg-white/10 transition-colors cursor-pointer text-zinc-100">
                    <MoreHorizontal className="w-6 h-6" />
                </button>
            </div>
        </div>
    );
}
