"use client";

import { useState } from "react";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// Past conversations, as a searchable palette.
//
// Same anatomy as CommunityQuickSwitcher (cmdk in a Dialog, grouped list,
// keyboard-hint footer) because that's this app's established "jump to a thing"
// pattern and the assistant shouldn't invent a second one. What differs is
// driven by the content, not by taste:
//
//   - Grouped by RECENCY (today / this week / earlier) rather than by kind.
//     The switcher groups by type because a channel and a server are different
//     things; every row here is the same kind of thing, and the only axis a
//     person actually remembers a conversation by is when they had it.
//   - Rows carry a delete affordance. Channels aren't disposable from a jump
//     palette; conversations accumulate, and a history list with no way to
//     remove anything becomes a liability the moment somebody asks the
//     assistant about their portfolio.

function groupFor(updatedAt: Date): "Today" | "This week" | "Earlier" {
    const now = Date.now();
    const age = now - updatedAt.getTime();
    if (age < 24 * 60 * 60 * 1000) return "Today";
    if (age < 7 * 24 * 60 * 60 * 1000) return "This week";
    return "Earlier";
}

const GROUP_ORDER = ["Today", "This week", "Earlier"] as const;

const HEADING =
    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-500";

export function AskHistoryDialog({
    open,
    onOpenChange,
    onPick,
    activeThreadId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Load this thread into the panel. */
    onPick: (threadId: string) => void;
    activeThreadId?: string;
}) {
    const [query, setQuery] = useState("");
    const utils = trpc.useUtils();
    const { data: threads = [], isLoading } = trpc.assistant.threads.useQuery(undefined, {
        enabled: open,
    });

    const remove = trpc.assistant.deleteThread.useMutation({
        onSuccess: () => utils.assistant.threads.invalidate(),
    });

    const close = () => {
        setQuery("");
        onOpenChange(false);
    };

    const pick = (id: string) => {
        close();
        onPick(id);
    };

    const grouped = GROUP_ORDER.map((label) => ({
        label,
        rows: threads.filter((t) => groupFor(new Date(t.updatedAt)) === label),
    })).filter((g) => g.rows.length > 0);

    return (
        <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
            <DialogContent
                showCloseButton={false}
                className="gap-0 overflow-hidden rounded-4xl p-0 sm:max-w-[560px]"
            >
                <VisuallyHidden>
                    <DialogTitle>Your conversations</DialogTitle>
                </VisuallyHidden>

                <Command loop shouldFilter className="bg-transparent">
                    <div className="p-4 pb-3">
                        <Command.Input
                            value={query}
                            onValueChange={setQuery}
                            autoFocus
                            placeholder="Search your conversations…"
                            className="h-14 w-full rounded-[18px] bg-white/[0.06] px-5 text-[16px] font-semibold tracking-tight text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.1]"
                        />
                    </div>

                    <Command.List className="hidden-scrollbar max-h-[380px] overflow-y-auto px-2.5 pb-3">
                        {/* cmdk renders Empty whenever nothing matches, which
                            during the first fetch would flash "no conversations"
                            at someone who has plenty. */}
                        {!isLoading && (
                            <Command.Empty className="py-10 text-center">
                                <p className="text-[14px] font-bold text-zinc-400">
                                    {threads.length === 0 ? "No conversations yet" : "Nothing matches that"}
                                </p>
                                <p className="mt-0.5 text-[12px] font-medium text-zinc-600">
                                    {threads.length === 0
                                        ? "Ask something and it'll show up here"
                                        : "Try a different word"}
                                </p>
                            </Command.Empty>
                        )}

                        {grouped.map((group) => (
                            <Command.Group key={group.label} heading={group.label} className={HEADING}>
                                {group.rows.map((t) => (
                                    <Command.Item
                                        key={t.id}
                                        value={`${t.title} ${t.id}`}
                                        onSelect={() => pick(t.id)}
                                        className="group flex cursor-pointer items-center gap-2.5 rounded-[16px] px-3 py-2.5 data-[selected=true]:bg-white/[0.07]"
                                    >
                                        <span
                                            className={cn(
                                                "min-w-0 flex-1 truncate text-[14px]",
                                                t.id === activeThreadId
                                                    ? "font-bold text-white"
                                                    : "font-semibold text-zinc-300",
                                            )}
                                        >
                                            {t.title}
                                        </span>

                                        {/* A span, not a button: cmdk items are
                                            themselves interactive, and a nested
                                            button both breaks its keyboard model
                                            and nests interactive elements. */}
                                        <span
                                            role="button"
                                            tabIndex={-1}
                                            aria-label="delete conversation"
                                            onClick={(e) => {
                                                // Without this the row's onSelect
                                                // also fires and the panel loads
                                                // the thread being deleted.
                                                e.stopPropagation();
                                                remove.mutate({ id: t.id });
                                            }}
                                            className="shrink-0 rounded-full p-1.5 text-zinc-600 opacity-0 transition-opacity hover:text-pastelred focus-visible:opacity-100 group-hover:opacity-100"
                                        >
                                            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                                        </span>
                                    </Command.Item>
                                ))}
                            </Command.Group>
                        ))}
                    </Command.List>

                    <div className="border-t border-white/5 px-5 py-2.5">
                        <p className="text-[11px] font-medium text-zinc-600">
                            <span className="font-bold text-zinc-500">↑↓</span> to navigate ·{" "}
                            <span className="font-bold text-zinc-500">↵</span> to open ·{" "}
                            <span className="font-bold text-zinc-500">esc</span> to close
                        </p>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
