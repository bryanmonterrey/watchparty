"use client";

import { parseAsString, useQueryState } from "nuqs";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConversations } from "@/hooks/use-conversations";
import { cn } from "@/lib/utils";

// Messages switcher for the app header — the page title doubles as a goo
// dropdown over recent conversations, same pattern as TradeNav/SettingsNav.
// Shows the active chat's name (?c= via nuqs, shared with the messages page)
// or "Messages" when nothing is open.

export function useActiveConversation() {
    return useQueryState("c", parseAsString);
}

export function MessagesNav() {
    const [activeId, setActiveId] = useActiveConversation();
    const { conversations } = useConversations(activeId);

    const active = conversations.find((c) => c.id === activeId);
    const title = active ? (active.groupName || active.otherParticipantName || "Chat") : "Messages";

    return (
        <GooDropdown
            align="start"
            side="bottom"
            width={288}
            gap={10}
            itemHeight={56}
            maxPanelHeight={480}
            triggerAriaLabel="Switch conversation"
            triggerClassName="flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-lg font-bold tracking-tight text-white transition-colors hover:bg-white/10"
            trigger={
                <>
                    {title}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-4.5 text-white/60" strokeWidth={2} />
                </>
            }
            items={conversations.slice(0, 8).map((c) => {
                const name = c.groupName || c.otherParticipantName || "Chat";
                const isActive = c.id === activeId;
                return {
                    key: c.id,
                    onClick: () => setActiveId(c.id),
                    className: "gap-3 px-3 cursor-pointer hover:bg-white/5 group",
                    label: (
                        <>
                            <Avatar className="size-9 shrink-0">
                                <AvatarImage src={c.otherParticipantAvatar ?? undefined} />
                                <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                                    {name[0]?.toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="flex min-w-0 flex-col">
                                <span className={cn("truncate text-[15px] font-bold", isActive ? "text-white" : "text-zinc-200")}>{name}</span>
                                {c.lastMessageContent && (
                                    <span className="truncate text-xs text-zinc-500">{c.lastMessageContent}</span>
                                )}
                            </span>
                        </>
                    ),
                };
            })}
        />
    );
}
