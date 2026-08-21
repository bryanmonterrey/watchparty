"use client";

import * as React from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Squircle } from "@/components/ui/squircle";
import { HugeiconsIcon } from "@hugeicons/react";
import { PencilEdit02Icon, Delete02Icon, ArrowLeft01Icon, ArrowRight01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { PanelCard, type PanelData } from "./panel-card";
import { PanelEditorDialog } from "./panel-editor-dialog";

// The About-tab panel grid. Public render is just PanelCards; the owner
// additionally gets an "Add panel" tile and hover controls per panel
// (edit / delete / move left / move right — reorder is position-swap).

export function PanelGrid({ userId }: { userId: string }) {
    const { data: session } = useAuthSession();
    const isOwner = session?.user?.id === userId;
    const { data: panels } = trpc.panels.list.useQuery({ userId });
    const utils = trpc.useUtils();
    const del = trpc.panels.delete.useMutation({ onSuccess: () => utils.panels.list.invalidate() });
    const reorder = trpc.panels.reorder.useMutation({ onSuccess: () => utils.panels.list.invalidate() });

    const [editing, setEditing] = React.useState<PanelData | null>(null);
    const [editorOpen, setEditorOpen] = React.useState(false);

    if (!panels) {
        return (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="shimmer-skeleton h-40 rounded-[16px]" />
                ))}
            </div>
        );
    }
    if (!panels.length && !isOwner) return null;

    const move = (index: number, dir: -1 | 1) => {
        const ids = panels.map((p) => p.id);
        const target = index + dir;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorder.mutate({ ids });
    };

    return (
        <div className="grid items-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {panels.map((panel, i) => (
                <div key={panel.id} className="group/panel relative">
                    <PanelCard panel={panel} />
                    {isOwner && (
                        <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/70 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover/panel:opacity-100">
                            <PanelControl label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>
                                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
                            </PanelControl>
                            <PanelControl label="Move right" disabled={i === panels.length - 1} onClick={() => move(i, 1)}>
                                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                            </PanelControl>
                            <PanelControl label="Edit panel" onClick={() => { setEditing(panel); setEditorOpen(true); }}>
                                <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
                            </PanelControl>
                            <PanelControl label="Delete panel" destructive onClick={() => del.mutate({ id: panel.id })}>
                                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                            </PanelControl>
                        </div>
                    )}
                </div>
            ))}

            {/* w-full is load-bearing, not decoration. Squircle renders a
                measuring wrapper div and THAT is the grid item, so it gets the
                cell's full width — but a button shrinks to fit rather than
                filling a block parent, so the tile collapsed to its own label
                (measured on prod: wrapper 244px, button 59px) and "Add panel"
                overhung both edges. PanelCard is unaffected because its grid
                item is a plain div. px-4 then keeps the label off the edges
                once the tile does fill. */}
            {isOwner && (
                <Squircle asChild radius={16}>
                    <button
                        onClick={() => { setEditing(null); setEditorOpen(true); }}
                        className="flex min-h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 px-4 bg-zinc-900/40 text-zinc-500 transition-colors hover:bg-zinc-900/70 hover:text-white"
                    >
                        <HugeiconsIcon icon={PlusSignIcon} className="size-6" />
                        <span className="text-xs font-bold">Add panel</span>
                    </button>
                </Squircle>
            )}

            {isOwner && (
                <PanelEditorDialog panel={editing} open={editorOpen} onOpenChange={setEditorOpen} />
            )}
        </div>
    );
}

function PanelControl({ children, label, onClick, disabled, destructive }: {
    children: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    destructive?: boolean;
}) {
    return (
        <button
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className={`flex size-7 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
                destructive ? "text-red-400 hover:bg-red-500/15" : "text-zinc-300 hover:bg-white/10 hover:text-white"
            }`}
        >
            {children}
        </button>
    );
}
