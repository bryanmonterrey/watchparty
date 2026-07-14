"use client";

import { nanoid } from "nanoid";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Delete02Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";

// Shared poll composer (post composer, composer dialog, create dialog).
// X-poll-block structure — question, choice inputs with a trailing add
// button, poll length, full-width remove footer — in watchparty's language:
// squircle card + inputs, goo dropdown for duration, pastelred remove.

export type PollOption = { id: string; text: string };
export type PollDuration = "1d" | "3d" | "7d";

const DURATIONS: { value: PollDuration; label: string }[] = [
    { value: "1d", label: "1 day" },
    { value: "3d", label: "3 days" },
    { value: "7d", label: "7 days" },
];

export function PollComposer({
    question,
    onQuestionChange,
    options,
    onOptionsChange,
    duration,
    onDurationChange,
    onRemove,
    className,
}: {
    question: string;
    onQuestionChange: (q: string) => void;
    options: PollOption[];
    onOptionsChange: (opts: PollOption[]) => void;
    duration: PollDuration;
    onDurationChange: (d: PollDuration) => void;
    onRemove: () => void;
    className?: string;
}) {
    const setText = (i: number, text: string) =>
        onOptionsChange(options.map((o, idx) => (idx === i ? { ...o, text } : o)));
    const removeOption = (i: number) =>
        onOptionsChange(options.filter((_, idx) => idx !== i));
    const addOption = () => {
        if (options.length < 4) onOptionsChange([...options, { id: nanoid(), text: "" }]);
    };

    return (
        <Squircle asChild radius={20} autoEffects={false}>
            <div className={cn("bg-panel", className)}>
                {/* Question + choices */}
                <div className="flex flex-col gap-2 p-3">
                    <input
                        placeholder="Ask a question…"
                        value={question}
                        onChange={(e) => onQuestionChange(e.target.value)}
                        maxLength={120}
                        className="h-10 bg-transparent px-1.5 text-[15px] font-semibold text-white outline-none placeholder:text-zinc-500"
                    />
                    {options.map((opt, i) => (
                        <div key={opt.id} className="flex items-center gap-1.5">
                            <Input
                                radius={14}
                                placeholder={`Choice ${i + 1}`}
                                value={opt.text}
                                maxLength={40}
                                onChange={(e) => setText(i, e.target.value)}
                                className="h-12 flex-1 text-[14px]"
                            />
                            {options.length > 2 && (
                                <button
                                    onClick={() => removeOption(i)}
                                    aria-label={`Remove choice ${i + 1}`}
                                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-600 transition-colors hover:bg-pastelred/10 hover:text-pastelred"
                                >
                                    <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                                </button>
                            )}
                            {i === options.length - 1 && options.length < 4 && (
                                <button
                                    onClick={addOption}
                                    aria-label="Add choice"
                                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
                                >
                                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Poll length */}
                <div className="flex items-center justify-between px-4 pb-1 pt-1">
                    <span className="text-[13px] font-semibold text-zinc-300">Poll length</span>
                    <GooDropdown
                        side="top"
                        align="end"
                        width={180}
                        gap={8}
                        fill="#101011"
                        buttonRadius={20}
                        panelRadius={16}
                        triggerAriaLabel="Poll length"
                        triggerClassName="flex h-10 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-white/10"
                        trigger={
                            <>
                                {DURATIONS.find((d) => d.value === duration)?.label}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={DURATIONS.map((d) => ({
                            key: d.value,
                            onClick: () => onDurationChange(d.value),
                            className: "justify-between text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                            label: (
                                <>
                                    {d.label}
                                    {duration === d.value && <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={2} />}
                                </>
                            ),
                        }))}
                    />
                </div>

                {/* Remove */}
                <div className="p-1.5">
                    <button
                        onClick={onRemove}
                        className="h-11 w-full cursor-pointer rounded-full text-[13px] font-bold text-pastelred transition-colors hover:bg-pastelred/10"
                    >
                        Remove poll
                    </button>
                </div>
            </div>
        </Squircle>
    );
}
