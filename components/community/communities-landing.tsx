"use client";

import { useState, useEffect } from "react";
import { Plus, Users2, Hash, ArrowRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { CategoryList } from "@/components/home/video-feed/category-list";

const COMMUNITY_CATEGORIES = ["All", "Gaming", "Crypto", "Music", "Art", "Tech", "Trading", "IRL"];

export function CommunitiesLanding() {
    const { data: session } = useAuthSession();
    const { data: servers = [], isLoading } = trpc.community.listServers.useQuery(
        undefined,
        { enabled: !!session?.user }
    );
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const utils = trpc.useUtils();

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
        <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 bg-black2">
            <div className="flex flex-col max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-white">
                            Communities
                        </h1>
                        <p className="text-flexwhite/40 mt-1.5 text-lg font-medium">
                            Your servers and community spaces
                        </p>
                    </div>
                </div>

                {/* Pre-hydration / auth-resolving placeholder — identical on server and client */}
                {!mounted && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-square rounded-[32px] bg-white/5 border border-flexwhite/10 animate-pulse" />
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
                                    placeholder="invite code"
                                    className="flex-1 min-w-0 bg-transparent text-sm text-flexwhite outline-none placeholder:text-flexwhite/35 py-1.5"
                                />
                                <button
                                    type="submit"
                                    disabled={!code.trim() || joinServer.isPending}
                                    className="shrink-0 h-9 px-5 flex items-center gap-1.5 rounded-full bg-twitter text-black2 font-semibold text-sm hover:bg-twitter2 active:scale-95 transition-all disabled:opacity-40"
                                >
                                    {joinServer.isPending ? <Loader2 className="size-4 animate-spin" /> : <>Join <ArrowRight className="size-4" /></>}
                                </button>
                            </div>
                            {joinServer.isError && (
                                <p className="text-xs text-darkfantasy mt-2.5 px-1">{joinServer.error.message}</p>
                            )}
                        </form>

                        {/* Category tabs — same component as the home feed */}
                        <div className="mb-8">
                            <CategoryList
                                activeTab={activeCat}
                                setActiveTab={setActiveCat}
                                categories={COMMUNITY_CATEGORIES}
                            />
                        </div>
                    </>
                )}

                {mounted && session?.user && isLoading && (
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="aspect-square rounded-[32px] bg-white/5 border border-flexwhite/10 animate-pulse" />
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
                                className="group cursor-pointer relative aspect-square rounded-[32px] border border-flexwhite/15 overflow-hidden transition-all"
                            >
                                {server.imageUrl ? (
                                    <Image
                                        src={server.imageUrl}
                                        alt={server.name}
                                        fill
                                        className="object-cover transition-transform duration-500 ease-out"
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <span className="text-5xl font-black text-white/20 group-hover:text-white/40 transition-colors duration-300">
                                            {server.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                )}

                                <div className="absolute inset-x-0 bottom-0 p-5 pt-12 transition-transform">
                                    <p className="text-white font-bold text-lg truncate drop-shadow-lg">{server.name}</p>
                                    <p className="text-white/40 text-xs font-bold uppercase tracking-wider mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Enter Server</p>
                                </div>
                            </motion.button>
                        ))}

                        {/* Create new server card */}
                        <motion.button
                            initial={{ opacity: 0, y: 0 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: servers.length * 0.05, type: "spring", damping: 20, stiffness: 100 }}
                            onClick={() => onOpen("createServer")}
                            className="aspect-square cursor-pointer rounded-[32px] border-2 border-dashed border-flexwhite/15 hover:border-twitter/50 flex flex-col items-center justify-center gap-3 transition group hover:bg-twitter/5"
                        >
                            <div className="size-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-twitter transition shadow-lg group-hover:shadow-twitter/20">
                                <Plus className="text-flexwhite/50 group-hover:text-black2 transition" size={32} />
                            </div>
                            <span className="text-sm font-bold text-flexwhite/50 group-hover:text-flexwhite transition">Add Server</span>
                        </motion.button>
                    </div>
                )}
            </div>
        </div>
    );
}
