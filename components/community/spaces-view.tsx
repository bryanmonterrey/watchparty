"use client";

import { useState } from "react";
import { Radio, Plus, Loader2, X, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SpacesSkeleton } from "./community-skeletons";
import { SpaceRoom } from "./space-room";

export function SpacesView() {
    const { data: session } = useAuthSession();
    const [activeSpace, setActiveSpace] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");

    const utils = trpc.useUtils();
    const live = trpc.spaces.listLive.useQuery(undefined, { enabled: !!session?.user });

    const create = trpc.spaces.create.useMutation({
        onSuccess: (space) => {
            setTitle("");
            setCreating(false);
            utils.spaces.listLive.invalidate();
            setActiveSpace(space.id);
        },
    });
    const join = trpc.spaces.join.useMutation({
        onSuccess: (_, vars) => setActiveSpace(vars.spaceId),
    });

    if (activeSpace) {
        return (
            <SpaceRoom
                spaceId={activeSpace}
                onLeave={() => {
                    setActiveSpace(null);
                    utils.spaces.listLive.invalidate();
                }}
            />
        );
    }

    const spaces = live.data ?? [];

    return (
        <ScrollArea className="flex-1 bg-background">
            <div className="flex flex-col p-6 pt-5 max-w-5xl mx-auto">
                {/* Header — title only (matches Communities), with the action beside it */}
                <div className="flex items-end gap-4 mb-8">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-white">Spaces</h1>
                        <p className="text-flexwhite/40 mt-1.5 text-lg font-medium">Drop in. Talk live.</p>
                    </div>

                    <button
                        onClick={() => setCreating((v) => !v)}
                        className="mb-1 flex items-center gap-2 px-5 py-2.5 rounded-full bg-twitter text-black font-semibold text-sm hover:bg-twitter2 active:scale-95 transition-all"
                    >
                        {creating ? <X className="size-4" /> : <Plus className="size-4" />}
                        {creating ? "Cancel" : "Start a Space"}
                    </button>
                </div>

                {/* Create form */}
                <AnimatePresence>
                    {creating && (
                        <motion.form
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (title.trim()) create.mutate({ title });
                            }}
                            className="overflow-hidden mb-8"
                        >
                            <div className="rounded-3xl border border-flexwhite/10 bg-white/[0.02] p-5">
                                <p className="text-sm font-semibold text-flexwhite mb-3">What do you want to talk about?</p>
                                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-full border border-flexwhite/10 focus-within:ring-1 focus-within:ring-white/20 transition-all pl-4 pr-1.5 py-1.5">
                                    <input
                                        autoFocus
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="Give your Space a name…"
                                        maxLength={120}
                                        className="flex-1 min-w-0 bg-transparent text-sm text-flexwhite outline-none placeholder:text-flexwhite/35 py-1.5"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!title.trim() || create.isPending}
                                        className="shrink-0 h-9 px-5 flex items-center gap-1.5 rounded-full bg-twitter text-black font-semibold text-sm hover:bg-twitter2 active:scale-95 transition-all disabled:opacity-40"
                                    >
                                        {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Go live"}
                                    </button>
                                </div>
                            </div>
                        </motion.form>
                    )}
                </AnimatePresence>

                {/* Live now */}
                <h2 className="text-sm font-bold uppercase tracking-wider text-flexwhite/40 mb-4 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-darkfantasy animate-pulse" />
                    Live now
                </h2>

                {live.isLoading ? (
                    <SpacesSkeleton />
                ) : spaces.length === 0 ? (
                    <div className="relative rounded-[28px] border border-flexwhite/10 overflow-hidden">
                        <div className="absolute inset-0 bg-zinc-900/60" />
                        <div className="relative flex flex-col items-center justify-center py-20 px-6 text-center">
                            <div className="size-20 rounded-full bg-white/5 border border-flexwhite/10 flex items-center justify-center mb-6">
                                <Radio className="size-9 text-flexwhite/30" />
                            </div>
                            <h3 className="text-xl font-bold text-flexwhite mb-1.5">No live Spaces right now</h3>
                            <p className="text-flexwhite/40 text-sm max-w-sm">
                                Be the first — start a Space and your communities can drop in.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {spaces.map((s, i) => (
                            <motion.button
                                key={s.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04, type: "spring", damping: 22, stiffness: 120 }}
                                onClick={() => join.mutate({ spaceId: s.id })}
                                disabled={join.isPending}
                                className="group text-left rounded-3xl border border-flexwhite/10 bg-white/[0.02] hover:bg-white/[0.05] hover:border-darkfantasy/30 p-5 transition-all"
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-darkfantasy">
                                        <span className="h-2 w-2 rounded-full bg-darkfantasy animate-pulse" />
                                        LIVE
                                    </span>
                                    <span className="ml-auto flex items-center gap-1 text-xs text-flexwhite/40">
                                        <Users className="size-3.5" />
                                        {s.participants}
                                    </span>
                                </div>
                                <p className="text-lg font-bold text-flexwhite leading-snug line-clamp-2">{s.title}</p>
                                <div className="flex items-center gap-2 mt-4">
                                    <Avatar className="size-6">
                                        <AvatarImage src={s.hostImage ?? undefined} alt={s.hostName ?? ""} />
                                        <AvatarFallback className="bg-zinc-700 text-flexwhite text-[10px]">
                                            {(s.hostName ?? "?").charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-flexwhite/50">
                                        {s.hostName ?? s.hostUsername ?? "Host"}
                                    </span>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                )}
            </div>
        </ScrollArea>
    );
}
