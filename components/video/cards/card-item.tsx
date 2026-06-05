"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, Trash2, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CARD_TYPE_LABELS, type DraftCard } from "./types";
import { TrashIcon } from "@/components/icons";

interface CardItemProps {
    card: DraftCard;
    isExpanded: boolean;
    isActive?: boolean;
    onToggle: () => void;
    onSetActive?: () => void;
    onChange: (patch: Partial<DraftCard>) => void;
    onSave: () => void;
    onDelete: () => void;
    onEditSearch: () => void;
    isSaving: boolean;
    duration: number;
}

function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function parseTime(str: string): number | null {
    const parts = str.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
}

export function CardItem({
    card,
    isExpanded,
    isActive,
    onToggle,
    onSetActive,
    onChange,
    onSave,
    onDelete,
    onEditSearch,
    isSaving: _isSaving,
    duration,
}: CardItemProps) {
    const [timeInput, setTimeInput] = useState(formatTime(card.startTime));
    const [timeError, setTimeError] = useState(false);
    const isFocused = useRef(false);

    useEffect(() => {
        if (!isFocused.current) {
            setTimeInput(formatTime(card.startTime));
            setTimeError(false);
        }
    }, [card.startTime]);

    const handleTimeBlur = () => {
        const parsed = parseTime(timeInput);
        if (parsed === null || parsed < 0 || (duration > 0 && parsed > duration)) {
            setTimeError(true);
            setTimeInput(formatTime(card.startTime));
        } else {
            setTimeError(false);
            onChange({ startTime: parsed });
            onSave();
        }
    };

    const selectedDisplay = card.title
        ? `${CARD_TYPE_LABELS[card.type]}: ${card.title}`
        : card.url
        ? `${CARD_TYPE_LABELS[card.type]}: ${card.url}`
        : `${CARD_TYPE_LABELS[card.type]} (not set)`;

    return (
        <div
            className={`transition-colors cursor-pointer mx-4 ${
                isActive
                    ? "border-l-2 border-l-white bg-white/5 rounded-r-xl"
                    : isExpanded
                    ? "border-l-white border-l-2"
                    : "border rounded-xl border-flexborder/60"
            }`}
            onClick={onSetActive}
        >
            {/* Header row */}
            <div className="flex items-center px-5 py-3.5 gap-3">
                <span className="flex-1 text-md font-medium text-[#f1f1f1] leading-none">
                    {CARD_TYPE_LABELS[card.type]} card
                </span>

                {/* Time input pill */}
                <input
                    value={timeInput}
                    onChange={e => setTimeInput(e.target.value)}
                    onFocus={() => { isFocused.current = true; }}
                    onBlur={() => { isFocused.current = false; handleTimeBlur(); }}
                    onClick={e => e.stopPropagation()}
                    className={`w-20 text-center cursor-pointer px-3 py-1.5 bg-zinc-900/60 rounded-lg text-sm font-medium text-zinc-300 border border-flexborder/40outline-none transition-colors ${
                        timeError
                            ? "border-red-500 text-red-400"
                            : "border-zinc-600 text-zinc-300 focus:border-zinc-400"
                    }`}
                />

                <button
                    onClick={e => { e.stopPropagation(); onToggle(); }}
                    className="text-zinc-400 cursor-pointer hover:text-white transition-colors"
                >
                    {isExpanded
                        ? <ChevronUp className="size-6" strokeWidth={2} />
                        : <ChevronDown className="size-6" strokeWidth={2} />
                    }
                </button>

                <button
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    className="text-zinc-500 cursor-pointer hover:text-white transition-colors"
                >
                    <TrashIcon className="size-[20px]"/>
                </button>
            </div>

            {/* Expanded content */}
            {isExpanded && (
                <div className="px-5 pb-5 space-y-3">
                    {/* Selected item row */}
                    <div className="flex items-center gap-3 border border-zinc-700/70 rounded-xl px-4 py-3">
                        <span className="flex-1 text-[13px] text-zinc-200 truncate min-w-0">
                            {selectedDisplay}
                        </span>
                        <button
                            onClick={onEditSearch}
                            className="text-zinc-500 hover:text-white transition-colors flex-shrink-0"
                        >
                            <Pencil className="size-4" strokeWidth={1.5} />
                        </button>
                    </div>

                    {/* Custom message */}
                    <div className="border border-zinc-700/70 rounded-xl px-4 pt-3 pb-2">
                        <p className="text-[11px] text-zinc-500 mb-1">Custom message</p>
                        <Textarea
                            value={card.message}
                            onChange={e => onChange({ message: e.target.value })}
                            onBlur={onSave}
                            placeholder="Add a message..."
                            maxLength={60}
                            rows={2}
                            className="bg-transparent border-0 p-0 text-[13px] text-zinc-200 placeholder:text-zinc-600 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-0"
                        />
                    </div>

                    {/* Teaser text */}
                    <div className="border border-zinc-700/70 rounded-xl px-4 pt-3 pb-2">
                        <p className="text-[11px] text-zinc-500 mb-1">Teaser text</p>
                        <Textarea
                            value={card.title}
                            onChange={e => onChange({ title: e.target.value })}
                            onBlur={onSave}
                            placeholder="Add teaser text..."
                            maxLength={30}
                            rows={2}
                            className="bg-transparent border-0 p-0 text-[13px] text-zinc-200 placeholder:text-zinc-600 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 min-h-0"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
