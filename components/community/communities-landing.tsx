"use client";

import { useState, useEffect } from "react";
import { Plus, Users2, Hash, ArrowRight, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { CategoryList } from "@/components/home/video-feed/category-list";
import { CreateIcon } from "../icons";

const COMMUNITY_CATEGORIES = ["All", "Gaming", "Crypto", "Music", "Art", "Tech", "Trading", "IRL"];

// ?template=CODE — create a new server pre-filled with another's structure.
function TemplateCreateCard({ code }: { code: string }) {
    const router = useRouter();
    const utils = trpc.useUtils();
    const [name, setName] = useState("");
    const { data, error } = trpc.community.getTemplatePreview.useQuery({ templateCode: code });
    const createServer = trpc.community.createServer.useMutation({
        onSuccess: (server) => {
            utils.community.listServers.invalidate();
            router.push(`/communities/${server.id}`);
        },
        onError: (err) => toast.error(err.message),
    });

    if (error) return null;
    if (!data) return <div className="mb-8 h-40 overflow-hidden rounded-[28px]"><div className="size-full shimmer-skeleton" /></div>;

    return (
        <div className="mb-8 rounded-[28px] bg-white/[0.03] p-6">
            <p className="text-[13px] font-semibold text-zinc-500">Server template</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-white">Start from “{data.name}”</h2>
            <p className="mt-1 text-[14px] font-medium text-zinc-500">
                {data.channels.length} channel{data.channels.length === 1 ? "" : "s"}: {data.channels.map((c) => `#${c.name}`).join(", ")} — plus its moderation and safety settings. No messages or members.
            </p>
            <div className="mt-4 flex items-center gap-2">
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name your server"
                    maxLength={100}
                    className="h-12 flex-1 rounded-2xl bg-white/[0.04] px-4 text-[14px] font-semibold text-white outline-none placeholder:text-zinc-600 focus:bg-white/[0.06]"
                />
                <button
                    onClick={() => createServer.mutate({ name: name.trim(), templateCode: code })}
                    disabled={!name.trim() || createServer.isPending}
                    className="h-12 shrink-0 cursor-pointer rounded-full bg-white px-6 text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                >
                    {createServer.isPending ? "Creating…" : "Create server"}
                </button>
            </div>
        </div>
    );
}

// Servers that opted into discovery — join without an invite.
function DiscoverSection() {
    const router = useRouter();
    const utils = trpc.useUtils();
    const { data: discoverable = [] } = trpc.community.listDiscoverable.useQuery();
    const joinDiscoverable = trpc.community.joinDiscoverable.useMutation({
        onSuccess: (res) => {
            utils.community.listServers.invalidate();
            utils.community.listDiscoverable.invalidate();
            router.push(`/communities/${res.serverId}`);
        },
        onError: (err) => toast.error(err.message),
    });

    const rows = discoverable.filter((s) => !s.joined);
    if (rows.length === 0) return null;

    return (
        <div className="mt-12">
            <h2 className="text-2xl font-black tracking-tighter text-white">Discover</h2>
            <p className="text-flexwhite/40 mt-1 mb-5 font-medium">
                Open communities anyone can join
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {rows.map((s) => (
                    <div key={s.id} className="overflow-hidden rounded-[28px] bg-white/[0.03]">
                        {s.bannerImageUrl ? (
                            <img src={s.bannerImageUrl} alt="" className="h-16 w-full object-cover" />
                        ) : (
                            <div className="h-16 w-full" style={{ backgroundColor: s.bannerColor || "#17181C" }} />
                        )}
                        <div className="px-5 pb-5">
                            <div className="-mt-6 grid size-12 place-items-center overflow-hidden rounded-[16px] bg-black4 ring-4 ring-background">
                                {s.imageUrl ? (
                                    <img src={s.imageUrl} alt="" className="size-full object-cover" />
                                ) : null}
                            </div>
                            <div className="mt-2.5 flex items-center gap-2">
                                <p className="min-w-0 truncate text-[16px] font-bold tracking-tight text-white">{s.name}</p>
                                {s.tag && (
                                    <span className="shrink-0 rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-zinc-200">
                                        {s.tag}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-medium text-zinc-500">
                                <span className="inline-block size-2 rounded-full bg-lantern" />
                                {s.memberCount} member{s.memberCount === 1 ? "" : "s"}
                            </p>
                            {s.description && (
                                <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-relaxed text-zinc-400">
                                    {s.description}
                                </p>
                            )}
                            <button
                                onClick={() => joinDiscoverable.mutate({ serverId: s.id })}
                                disabled={joinDiscoverable.isPending}
                                className="mt-4 h-11 w-full cursor-pointer rounded-full bg-white/10 text-[14px] font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-50"
                            >
                                Join server
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CommunitiesLanding() {
    const { data: session } = useAuthSession();
    const { data: servers = [], isLoading } = trpc.community.listServers.useQuery(
        undefined,
        { enabled: !!session?.user }
    );
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const utils = trpc.useUtils();
    const searchParams = useSearchParams();
    const templateCode = searchParams?.get("template") ?? null;

    const [code, setCode] = useState("");
    const [activeCat, setActiveCat] = useState("All");

    // Auth state is resolved client-side, so gate auth-dependent UI until after
    // mount to keep the server HTML and first client render identical (no hydration mismatch).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const joinServer = trpc.community.joinServer.useMutation({
        onSuccess: (res) => {
            utils.community.listServers.invalidate();
            setCode("");
            router.push(`/communities/${res.serverId}`);
        },
    });

    const onJoin = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = code.trim().replace(/.*\//, ""); // accept full invite urls too
        if (trimmed) joinServer.mutate({ inviteCode: trimmed });
    };

    return (
        <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 bg-sidebar-hover/25">
            <div className="flex flex-col max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-white">
                            Communities
                        </h1>
                        <p className="text-zinc-400 mt-1.5 text-lg font-medium">
                            Your servers and community spaces
                        </p>
                    </div>
                </div>

                {/* Pre-hydration / auth-resolving placeholder — identical on server and client */}
                {!mounted && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-square flex flex-col p-4 gap-2 items-start justify-end rounded-[32px] border border-baseborder/25" >
                                <div className="relative h-3.5 w-3/4 bg-soft-gray-10 rounded-xs" />
                                <div className="relative h-3.5 w-2/3 bg-soft-gray-10 rounded-xs" />
                            
                            </div>
                        ))}
                    </div>
                )}

                {mounted && !session?.user && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="size-24 rounded-3xl bg-white/[0.03] border border-flexwhite/10 flex items-center justify-center mb-8 shadow-2xl">
                            <Users2 className="size-12 text-flexwhite/40" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Join a Community</h2>
                        <p className="text-flexwhite/40 text-lg max-w-sm mb-8">Sign in to sync your servers and start chatting with your friends</p>
                        <button className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition">
                            Sign In
                        </button>
                    </div>
                )}

                {mounted && session?.user && templateCode && <TemplateCreateCard code={templateCode} />}

                {mounted && session?.user && (
                    <>
                        {/* Join by invite */}
                        <form
                            onSubmit={onJoin}
                            className="rounded-3xl hidden border border-flexwhite/10 bg-white/[0.02] p-5 mb-6"
                        >
                            <p className="text-sm font-semibold text-flexwhite mb-1">Have an invite?</p>
                            <p className="text-xs text-flexwhite/40 mb-4">Paste an invite code or link to jump straight in.</p>
                            <div className="flex items-center gap-2 bg-zinc-800/50 rounded-full border border-flexwhite/10 focus-within:ring-1 focus-within:ring-white/20 transition-all pl-4 pr-1.5 py-1.5">
                                <Hash className="size-4 text-flexwhite/30 shrink-0" />
                                <input
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    placeholder="Invite code"
                                    className="flex-1 min-w-0 bg-transparent text-sm text-flexwhite outline-none placeholder:text-flexwhite/35 py-1.5"
                                />
                                <button
                                    type="submit"
                                    disabled={!code.trim() || joinServer.isPending}
                                    className="shrink-0 h-9 px-5 flex items-center gap-1.5 rounded-full bg-twitter text-black font-semibold text-sm hover:bg-twitter2 active:scale-95 transition-all disabled:opacity-40"
                                >
                                    {joinServer.isPending ? <Loader2 className="size-4 animate-spin" /> : <>Join <ArrowRight className="size-4" /></>}
                                </button>
                            </div>
                            {joinServer.isError && (
                                <p className="text-xs text-darkfantasy mt-2.5 px-1">{joinServer.error.message}</p>
                            )}
                        </form>
                    </>
                )}

                {mounted && session?.user && isLoading && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-square flex flex-col p-4 gap-2 items-start justify-end rounded-[32px] border border-baseborder/25" >
                                <div className="relative h-3.5 w-3/4 bg-soft-gray-10 rounded-xs" />
                                <div className="relative h-3.5 w-2/3 bg-soft-gray-10 rounded-xs" />
                            
                            </div>
                        ))}
                    </div>
                )}

                {mounted && session?.user && !isLoading && servers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="size-24 rounded-3xl bg-white/[0.03] border border-flexwhite/10 flex items-center justify-center mb-8 shadow-2xl">
                            <Plus className="size-12 text-flexwhite/40" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Create your first server</h2>
                        <p className="text-flexwhite/40 text-lg max-w-xs mb-10">Your server is where you and your friends hang out. Make yours and start talking!</p>
                        <button
                            onClick={() => onOpen("createServer")}
                            className="px-8 py-3 bg-white text-black rounded-full font-bold hover:bg-zinc-200 transition shadow-xl text-lg"
                        >
                            Create Server
                        </button>
                    </div>
                )}

                {mounted && session?.user && servers.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {servers.map((server, index) => (
                            <motion.button
                                key={server.id}
                                initial={{ opacity: 0, y: 0 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05, type: "spring", damping: 20, stiffness: 100 }}
                                onClick={() => router.push(`/communities/${server.id}`)}
                                className="group cursor-pointer relative aspect-square rounded-[36px] border border-zinc-500/25 overflow-hidden transition-all"
                            >
                                {server.imageUrl ? (
                                    <img
                                        src={server.imageUrl}
                                        alt={server.name}
                                        className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out"
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-5xl font-black text-white/20 group-hover:text-white/40 transition-colors duration-300">
                                        </span>
                                    </div>
                                )}

                                <div className="absolute inset-x-0 bottom-0 p-5 pt-12 transition-transform">
                                    <p className="text-white font-bold text-lg truncate drop-shadow-lg">{server.name}</p>
                                </div>
                            </motion.button>
                        ))}

                        {/* Create new server card */}
                        <motion.button
                            initial={{ opacity: 0, y: 0 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: servers.length * 0.05, type: "spring", damping: 20, stiffness: 100 }}
                            onClick={() => onOpen("createServer")}
                            className="aspect-square cursor-pointer rounded-[36px] border-2 border-dashed border-zinc-500/25 hover:border-white/50 flex flex-col items-center justify-center gap-3 transition group hover:bg-white/5"
                        >
                            <div className="size-18 flex items-center justify-center transition">
                                <CreateIcon className="text-flexwhite/50 size-12 transition" />
                            </div>

                        </motion.button>
                    </div>
                )}

                {mounted && session?.user && !isLoading && <DiscoverSection />}
            </div>
        </div>
    );
}
