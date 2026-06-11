"use client";

import { useEffect, useState } from "react";
import { Users, UserPlus, Search, Check, X, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FriendsSkeleton } from "./community-skeletons";
import { cn } from "@/lib/utils";

const TABS = ["Online", "All", "Pending", "Add Friend"] as const;
type Tab = (typeof TABS)[number];

type FriendUser = {
    id: string;
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    isOnline?: boolean;
};

export function FriendsView() {
    const { data: session } = useAuthSession();
    const [tab, setTab] = useState<Tab>("Online");
    const utils = trpc.useUtils();
    const heartbeat = trpc.user.heartbeat.useMutation();

    // Keep the current user marked online while on this page.
    useEffect(() => {
        if (!session?.user) return;
        heartbeat.mutate();
        const id = setInterval(() => heartbeat.mutate(), 60_000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    const enabled = !!session?.user;
    const list = trpc.friends.list.useQuery({ onlineOnly: tab === "Online" }, { enabled });
    const pending = trpc.friends.pending.useQuery(undefined, { enabled: enabled && tab === "Pending" });

    const invalidate = () => {
        utils.friends.list.invalidate();
        utils.friends.pending.invalidate();
    };
    const removeFriend = trpc.friends.remove.useMutation({ onSuccess: invalidate });
    const addFriend = trpc.friends.add.useMutation({ onSuccess: invalidate });

    const pendingCount = (pending.data?.incoming.length ?? 0) + (pending.data?.outgoing.length ?? 0);

    return (
        <div className="flex flex-col h-full bg-black">
            {/* Tab bar */}
            <div className="h-14 shrink-0 px-4 flex items-center gap-1 border-b border-flexwhite/15">
                <div className="flex items-center gap-2 mr-2 text-flexwhite font-bold">
                    <Users className="size-5 text-flexwhite/50" />
                    Friends
                </div>
                <span className="h-5 w-px bg-flexwhite/10 mx-2" />
                {TABS.map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-sm font-semibold transition-colors flex items-center gap-1.5",
                            t === "Add Friend"
                                ? tab === t
                                    ? "bg-twitter text-black2"
                                    : "text-twitter hover:bg-twitter/10"
                                : tab === t
                                    ? "bg-white/10 text-flexwhite"
                                    : "text-flexwhite/50 hover:bg-white/5 hover:text-flexwhite/80"
                        )}
                    >
                        {t}
                        {t === "Pending" && pendingCount > 0 && (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-darkfantasy text-white text-[11px] font-bold flex items-center justify-center">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6 max-w-3xl mx-auto">
                    {tab === "Add Friend" ? (
                        <AddFriendPanel onAdded={invalidate} />
                    ) : tab === "Pending" ? (
                        pending.isLoading ? (
                            <FriendsSkeleton />
                        ) : pendingCount === 0 ? (
                            <EmptyFriends tab={tab} />
                        ) : (
                            <div className="space-y-6">
                                {!!pending.data?.incoming.length && (
                                    <Section title={`Incoming — ${pending.data.incoming.length}`}>
                                        {pending.data.incoming.map((u) => (
                                            <FriendRow
                                                key={u.id}
                                                user={u}
                                                actions={
                                                    <>
                                                        <IconBtn
                                                            title="Accept"
                                                            tone="accept"
                                                            onClick={() => addFriend.mutate({ userId: u.id })}
                                                        >
                                                            <Check className="size-4" />
                                                        </IconBtn>
                                                        <IconBtn
                                                            title="Ignore"
                                                            onClick={() => removeFriend.mutate({ userId: u.id })}
                                                        >
                                                            <X className="size-4" />
                                                        </IconBtn>
                                                    </>
                                                }
                                            />
                                        ))}
                                    </Section>
                                )}
                                {!!pending.data?.outgoing.length && (
                                    <Section title={`Outgoing — ${pending.data.outgoing.length}`}>
                                        {pending.data.outgoing.map((u) => (
                                            <FriendRow
                                                key={u.id}
                                                user={u}
                                                subtitle="Request sent"
                                                actions={
                                                    <IconBtn
                                                        title="Cancel"
                                                        onClick={() => removeFriend.mutate({ userId: u.id })}
                                                    >
                                                        <X className="size-4" />
                                                    </IconBtn>
                                                }
                                            />
                                        ))}
                                    </Section>
                                )}
                            </div>
                        )
                    ) : list.isLoading ? (
                        <FriendsSkeleton />
                    ) : !list.data?.friends.length ? (
                        <EmptyFriends tab={tab} />
                    ) : (
                        <Section
                            title={
                                tab === "Online"
                                    ? `Online — ${list.data.onlineCount}`
                                    : `All friends — ${list.data.friends.length}`
                            }
                        >
                            {list.data.friends.map((u) => (
                                <FriendRow
                                    key={u.id}
                                    user={u}
                                    subtitle={u.isOnline ? "Online" : "Offline"}
                                    actions={
                                        <IconBtn
                                            title="Remove friend"
                                            onClick={() => removeFriend.mutate({ userId: u.id })}
                                        >
                                            <X className="size-4" />
                                        </IconBtn>
                                    }
                                />
                            ))}
                        </Section>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 mb-2 px-1">
                {title}
            </h3>
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}

function FriendRow({
    user,
    subtitle,
    actions,
}: {
    user: FriendUser;
    subtitle?: string;
    actions?: React.ReactNode;
}) {
    return (
        <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors">
            <div className="relative">
                <Avatar className="h-10 w-10">
                    <AvatarImage src={user.avatar_url ?? undefined} alt={user.name ?? ""} />
                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-sm">
                        {(user.name ?? user.username ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                {typeof user.isOnline === "boolean" && (
                    <span
                        className={cn(
                            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-black2",
                            user.isOnline ? "bg-twitter shadow-[0_0_6px_var(--color-twitter)]" : "bg-zinc-600"
                        )}
                    />
                )}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-semibold text-flexwhite truncate">
                    {user.name ?? user.username ?? "Unknown"}
                </p>
                {subtitle && <p className="text-xs text-flexwhite/40 truncate">{subtitle}</p>}
            </div>
            <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {actions}
            </div>
        </div>
    );
}

function IconBtn({
    children,
    title,
    onClick,
    tone,
}: {
    children: React.ReactNode;
    title: string;
    onClick?: () => void;
    tone?: "accept";
}) {
    return (
        <button
            title={title}
            onClick={onClick}
            className={cn(
                "h-8 w-8 flex items-center justify-center rounded-full transition-colors",
                tone === "accept"
                    ? "bg-twitter/15 text-twitter hover:bg-twitter hover:text-black2"
                    : "bg-white/5 text-flexwhite/60 hover:bg-white/10 hover:text-flexwhite"
            )}
        >
            {children}
        </button>
    );
}

function AddFriendPanel({ onAdded }: { onAdded: () => void }) {
    const [handle, setHandle] = useState("");
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const add = trpc.friends.addByUsername.useMutation({
        onSuccess: (res) => {
            setHandle("");
            setMsg({
                ok: true,
                text: res.nowFriends ? "You're now friends! 🎉" : "Friend request sent.",
            });
            onAdded();
        },
        onError: (e) => setMsg({ ok: false, text: e.message }),
    });

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (handle.trim()) add.mutate({ username: handle });
    };

    return (
        <div>
            <h2 className="text-lg font-bold text-flexwhite mb-1">Add Friend</h2>
            <p className="text-sm text-flexwhite/40 mb-5">You can add friends with their username.</p>
            <form
                onSubmit={onSubmit}
                className="flex items-center gap-2 bg-zinc-800/50 rounded-full border border-flexwhite/10 focus-within:ring-1 focus-within:ring-white/20 transition-all pl-4 pr-1.5 py-1.5"
            >
                <span className="text-flexwhite/30 text-sm">@</span>
                <input
                    value={handle}
                    onChange={(e) => {
                        setHandle(e.target.value);
                        setMsg(null);
                    }}
                    placeholder="username"
                    className="flex-1 min-w-0 bg-transparent text-sm text-flexwhite outline-none placeholder:text-flexwhite/35 py-1.5"
                />
                <button
                    type="submit"
                    disabled={!handle.trim() || add.isPending}
                    className="shrink-0 h-9 px-5 flex items-center gap-1.5 rounded-full bg-twitter text-black2 font-semibold text-sm hover:bg-twitter2 active:scale-95 transition-all disabled:opacity-40"
                >
                    {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                    Send
                </button>
            </form>
            {msg && (
                <p className={cn("text-xs mt-2.5 px-1", msg.ok ? "text-twitter" : "text-darkfantasy")}>{msg.text}</p>
            )}
        </div>
    );
}

function EmptyFriends({ tab }: { tab: Tab }) {
    const copy: Record<Tab, { title: string; sub: string }> = {
        Online: { title: "No one's around", sub: "When your friends are online, you'll see them here." },
        All: { title: "No friends yet", sub: "Add someone from the Add Friend tab to start your list." },
        Pending: { title: "No pending requests", sub: "Friend requests you send or receive show up here." },
        "Add Friend": { title: "", sub: "" },
    };
    const { title, sub } = copy[tab];
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="size-20 rounded-full bg-white/5 border border-flexwhite/10 flex items-center justify-center mb-6">
                <Search className="size-9 text-flexwhite/25" />
            </div>
            <h3 className="text-lg font-bold text-flexwhite mb-1.5">{title}</h3>
            <p className="text-flexwhite/40 text-sm max-w-xs">{sub}</p>
        </div>
    );
}
