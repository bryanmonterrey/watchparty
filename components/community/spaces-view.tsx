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
                {/* Header */}
                <div className="mb-7 flex items-center gap-5">
                    <div>
                        <h1 className="text-[24px] font-bold tracking-tight text-white">Spaces</h1>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Drop in. Talk live.</p>
                    </div>

                    <button
                        onClick={() => setCreating((v) => !v)}
                        className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-[13px] font-bold text-black transition-transform hover:bg-white/90 active:scale-95"
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
                            <div className="rounded-3xl bg-white/[0.03] p-5">
                                <p className="mb-3 text-[14px] font-semibold text-zinc-300">What do you want to talk about?</p>
                                <div className="flex items-center gap-2 rounded-full bg-white/[0.06] transition-colors focus-within:bg-white/[0.1] pl-4 pr-1.5 py-1.5">
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
                <h2 className="mb-4 flex items-center gap-2 text-[14px] font-semibold text-zinc-500">
                    <span className="size-2 animate-pulse rounded-full bg-pastelred" />
                    Live now
                </h2>

                {live.isLoading ? (
                    <SpacesSkeleton />
                ) : spaces.length === 0 ? (
                    <div className="rounded-[28px] bg-white/[0.03] px-6 py-16">
                        <div className="flex flex-col items-center gap-5 text-center">
                            <div className="grid size-16 place-items-center rounded-full bg-white/5">
                                <Radio className="size-7 text-zinc-500" />
                            </div>
                            <div className="space-y-1.5">
                                <h3 className="text-[20px] font-bold tracking-tight text-white">No live Spaces right now</h3>
                                <p className="max-w-sm text-[13px] font-medium leading-relaxed text-zinc-500">
                                    Be the first — start a Space and your communities can drop in.
                                </p>
                            </div>
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
                                className="group cursor-pointer text-left rounded-3xl bg-white/[0.03] hover:bg-white/[0.06] p-5 transition-colors disabled:opacity-60"
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="flex items-center gap-1.5 rounded-full bg-pastelred/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-pastelred">
                                        <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
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
