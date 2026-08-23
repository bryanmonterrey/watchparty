"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";

import { Switch } from "@/components/ui/switch";

// Tags, language and the 18+ flag — the "Edit Stream Info parity" half of
// studio S6, kept out of stream-manager.tsx so the cockpit stays under the
// 1000-line file guard.
//
// These are DISCOVERY fields: they exist so a viewer who wants Spanish
// speedruns can find one. That is also why "not stated" is a real value for
// language rather than a default — claiming English on behalf of every stream
// that never answered would poison the filter it feeds.

const MAX_TAGS = 5;

/** The languages a browse filter can realistically offer, plus "not stated". */
const LANGUAGES: { code: string; label: string }[] = [
    { code: "en", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "pt", label: "Portuguese" },
    { code: "fr", label: "French" },
    { code: "de", label: "German" },
    { code: "it", label: "Italian" },
    { code: "tr", label: "Turkish" },
    { code: "ru", label: "Russian" },
    { code: "ar", label: "Arabic" },
    { code: "hi", label: "Hindi" },
    { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },
    { code: "zh", label: "Chinese" },
];

export function StreamDiscoveryFields({
    tags,
    onTagsChange,
    language,
    onLanguageChange,
    isMature,
    onMatureChange,
}: {
    tags: string[];
    onTagsChange: (next: string[]) => void;
    language: string;
    onLanguageChange: (next: string) => void;
    isMature: boolean;
    onMatureChange: (next: boolean) => void;
}) {
    const [draft, setDraft] = React.useState("");

    const commit = () => {
        const value = draft.trim().replace(/^#/, "").slice(0, 25);
        if (!value) return;
        // Case-insensitive dedupe: "Speedrun" and "speedrun" are one facet, and
        // letting both in splits the filter that reads them.
        if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
            setDraft("");
            return;
        }
        if (tags.length >= MAX_TAGS) return;
        onTagsChange([...tags, value]);
        setDraft("");
    };

    return (
        <>
            <div>
                <p className="mb-1 text-xs text-muted-foreground">
                    Tags <span className="text-muted-foreground/70">({tags.length}/{MAX_TAGS})</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border/60 p-2">
                    {tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full bg-muted/50 py-1 pl-2.5 pr-1.5 text-xs"
                        >
                            {tag}
                            <button
                                type="button"
                                aria-label={`Remove ${tag}`}
                                onClick={() => onTagsChange(tags.filter((t) => t !== tag))}
                                className="text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                            </button>
                        </span>
                    ))}
                    {tags.length < MAX_TAGS ? (
                        <input
                            value={draft}
                            maxLength={25}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                // Comma too: people type tag lists with commas
                                // whatever the affordance says.
                                if (e.key === "Enter" || e.key === ",") {
                                    e.preventDefault();
                                    commit();
                                } else if (e.key === "Backspace" && !draft && tags.length) {
                                    onTagsChange(tags.slice(0, -1));
                                }
                            }}
                            // Blur commits, or a typed-but-unconfirmed tag is
                            // silently dropped by the Save the user then clicks.
                            onBlur={commit}
                            placeholder={tags.length ? "Add another…" : "speedrun, no mic, first playthrough"}
                            className="h-7 min-w-[8rem] flex-1 bg-transparent px-1 text-sm outline-none"
                        />
                    ) : null}
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <p className="mb-1 text-xs text-muted-foreground">Language</p>
                    <select
                        value={language}
                        onChange={(e) => onLanguageChange(e.target.value)}
                        className="h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="">Not stated</option>
                        {LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code}>
                                {l.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-end">
                    <label className="flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 px-3">
                        <span className="flex flex-col">
                            <span className="text-sm">18+</span>
                            <span className="text-11 text-muted-foreground">Mature content</span>
                        </span>
                        <Switch checked={isMature} onCheckedChange={onMatureChange} />
                    </label>
                </div>
            </div>
        </>
    );
}
