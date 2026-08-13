"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Shield, ShieldCheck, Flag, CheckCircle2, XCircle, Clock, Users, FileText, AlertTriangle, Search, ChevronRight, ChevronDown } from "lucide-react";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Tab = "overview" | "reports" | "verification" | "scopes" | "users";

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
    return (
        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4">
            <div className={cn("flex items-center gap-2 mb-2", color)}>
                {icon}
                <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{value.toLocaleString()}</p>
        </div>
    );
}

function ReportsTab() {
    const utils = trpc.useUtils();
    const [filter, setFilter] = useState<"pending" | "resolved" | "dismissed">("pending");
    const { data, isLoading } = trpc.admin.getReports.useQuery({ status: filter });
    const resolve = trpc.admin.resolveReport.useMutation({
        onSuccess: () => { utils.admin.getReports.invalidate(); utils.admin.getStats.invalidate(); toast.success("Report updated"); },
    });

    return (
        <div className="space-y-4">
            <div className="flex gap-1">
                {(["pending", "resolved", "dismissed"] as const).map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors", filter === s ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                        {s}
                    </button>
                ))}
            </div>

            {isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
            : !data?.length ? (
                <div className="text-center py-12 text-zinc-600">
                    <Flag className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No {filter} reports</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {data.map(r => (
                        <div key={r.id} className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-0.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-bold text-red-400 uppercase">{r.reason.replace(/_/g, " ")}</span>
                                        {r.targetPostId && <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Post</span>}
                                        {r.targetUserId && <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">User</span>}
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        by @{r.reporterUsername} · {formatDistanceToNow(new Date(r.createdAt))} ago
                                    </p>
                                    {r.details && <p className="text-xs text-zinc-500 truncate">{r.details}</p>}
                                </div>
                                {filter === "pending" && (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button onClick={() => resolve.mutate({ reportId: r.id, status: "resolved" })}
                                            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => resolve.mutate({ reportId: r.id, status: "dismissed" })}
                                            className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors">
                                            <XCircle className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function VerificationTab() {
    const utils = trpc.useUtils();
    const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
    const { data, isLoading } = trpc.admin.getVerificationRequests.useQuery({ status: filter });
    const review = trpc.admin.reviewVerification.useMutation({
        onSuccess: () => { utils.admin.getVerificationRequests.invalidate(); utils.admin.getStats.invalidate(); toast.success("Decision saved"); },
    });
    const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

    return (
        <div className="space-y-4">
            <div className="flex gap-1">
                {(["pending", "approved", "rejected"] as const).map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors", filter === s ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                        {s}
                    </button>
                ))}
            </div>

            {isLoading ? <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
            : !data?.length ? (
                <div className="text-center py-12 text-zinc-600">
                    <Shield className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No {filter} verification requests</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {data.map(v => (
                        <div key={v.id} className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                {v.userAvatar
                                    ? <img src={v.userAvatar} className="w-9 h-9 rounded-full" />
                                    : <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-sm">{v.userName?.[0]}</div>
                                }
                                <div>
                                    <p className="text-sm font-semibold text-zinc-200">{v.userName}</p>
                                    <p className="text-xs text-zinc-500">@{v.userUsername} · requesting <span className="text-white font-semibold">{v.requestedTier}</span></p>
                                </div>
                            </div>
                            <div className="space-y-1 text-xs text-zinc-400">
                                <p><span className="text-zinc-500">Full name:</span> {v.fullName}</p>
                                {v.website && <p><span className="text-zinc-500">Website:</span> {v.website}</p>}
                                {v.twitterHandle && <p><span className="text-zinc-500">Twitter:</span> {v.twitterHandle}</p>}
                                <p className="text-zinc-300 mt-1">{v.reason}</p>
                            </div>
                            {filter === "pending" && (
                                <div className="space-y-2">
                                    <input
                                        placeholder="Rejection reason (optional)"
                                        value={rejectReason[v.id] ?? ""}
                                        onChange={e => setRejectReason(prev => ({ ...prev, [v.id]: e.target.value }))}
                                        className="w-full px-3 py-1.5 bg-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => review.mutate({ requestId: v.id, action: "approve" })}
                                            className="flex-1 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-bold hover:bg-white/90 transition-colors">
                                            Approve
                                        </button>
                                        <button onClick={() => review.mutate({ requestId: v.id, action: "reject", rejectionReason: rejectReason[v.id] })}
                                            className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors">
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Privileged OAuth scope requests (Phase 11). Approving writes the scope onto
// the app's oauthClient allow-list. Inert until PRIVILEGED_SCOPE_IDS is set, so
// this normally shows an empty queue.
function ScopeRequestsTab() {
    const utils = trpc.useUtils();
    const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
    const { data, isLoading } = trpc.admin.getScopeRequests.useQuery({ status: filter });
    const review = trpc.admin.reviewScopeRequest.useMutation({
        onSuccess: () => { utils.admin.getScopeRequests.invalidate(); toast.success("Decision saved"); },
    });
    const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

    return (
        <div className="space-y-4">
            <div className="flex gap-1">
                {(["pending", "approved", "rejected"] as const).map(s => (
                    <button key={s} onClick={() => setFilter(s)}
                        className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors", filter === s ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                        {s}
                    </button>
                ))}
            </div>

            {isLoading ? <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            : !data?.length ? (
                <div className="text-center py-12 text-zinc-600">
                    <Shield className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No {filter} scope requests</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {data.map(r => (
                        <div key={r.id} className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                            <div>
                                <p className="text-sm font-semibold text-zinc-200">{r.appName}</p>
                                <p className="text-xs text-zinc-500">@{r.ownerUsername} · requesting <span className="font-mono text-white">{r.scope}</span></p>
                                {r.reason && <p className="text-zinc-300 mt-1 text-xs">{r.reason}</p>}
                            </div>
                            {filter === "pending" && (
                                <div className="space-y-2">
                                    <input
                                        placeholder="Rejection reason (optional)"
                                        value={rejectReason[r.id] ?? ""}
                                        onChange={e => setRejectReason(prev => ({ ...prev, [r.id]: e.target.value }))}
                                        className="w-full px-3 py-1.5 bg-zinc-800 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => review.mutate({ requestId: r.id, action: "approve" })}
                                            className="flex-1 py-1.5 rounded-lg bg-white text-zinc-950 text-xs font-bold hover:bg-white/90 transition-colors">
                                            Approve
                                        </button>
                                        <button onClick={() => review.mutate({ requestId: r.id, action: "reject", rejectionReason: rejectReason[r.id] })}
                                            className="flex-1 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors">
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function UsersTab() {
    const [query, setQuery] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const { data } = trpc.admin.searchUsers.useQuery({ query: debouncedQ }, { enabled: debouncedQ.length > 0 });
    const setRole = trpc.admin.setUserRole.useMutation({ onSuccess: () => toast.success("Role updated") });
    const suspend = trpc.admin.suspendUser.useMutation({ onSuccess: () => toast.success("User suspended") });

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                    value={query}
                    onChange={e => { setQuery(e.target.value); setTimeout(() => setDebouncedQ(e.target.value), 400); }}
                    placeholder="Search users by name or @username…"
                    className="h-[52px] w-full rounded-full bg-zinc-800 pl-9 pr-3 text-[16px] font-medium text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30"
                />
            </div>
            {data && (
                <div className="space-y-2">
                    {data.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                            {u.avatar_url
                                ? <img src={u.avatar_url} className="w-9 h-9 rounded-full" />
                                : <img src="/avatar.png" alt="" className="w-9 h-9 rounded-full object-cover" />
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-zinc-200">{u.name}</p>
                                <p className="text-xs text-zinc-500">@{u.username} · <span className="text-zinc-400">{u.role}</span></p>
                            </div>
                            <div className="flex gap-1.5">
                                <GooDropdown
                                    align="end"
                                    width={140}
                                    gap={8}
                                    buttonRadius={8}
                                    triggerClassName="flex items-center gap-1 bg-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1 border border-white/10"
                                    trigger={
                                        <>
                                            {u.role === "user" && "User"}
                                            {u.role === "moderator" && "Moderator"}
                                            {u.role === "admin" && "Admin"}
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </>
                                    }
                                    items={([
                                        { value: "user", label: "User" },
                                        { value: "moderator", label: "Moderator" },
                                        { value: "admin", label: "Admin" },
                                    ] as const).map((opt) => ({
                                        key: opt.value,
                                        onClick: () => setRole.mutate({ userId: u.id, role: opt.value }),
                                        className: "text-xs text-zinc-300 hover:bg-white/10",
                                        label: opt.label,
                                    }))}
                                />
                                <button onClick={() => suspend.mutate({ userId: u.id })}
                                    className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors">
                                    Suspend
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function AdminDashboard() {
    const { data: session } = useAuthSession();
    const [tab, setTab] = useState<Tab>("overview");
    const { data: stats, isLoading } = trpc.admin.getStats.useQuery(undefined, { enabled: session?.user?.role === "admin" });

    if (session?.user?.role !== "admin") {
        return (
            <div className="text-center py-12 space-y-2">
                <Shield className="w-10 h-10 mx-auto text-zinc-700" />
                <p className="text-sm text-zinc-500">Admin access required</p>
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: "overview", label: "Overview", icon: <FileText className="w-4 h-4" /> },
        { id: "reports", label: "Reports", icon: <Flag className="w-4 h-4" />, badge: stats?.pendingReports },
        { id: "verification", label: "Verification", icon: <ShieldCheck className="w-4 h-4" />, badge: stats?.pendingVerifications },
        { id: "scopes", label: "Scopes", icon: <Shield className="w-4 h-4" /> },
        { id: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-400" />
                <h2 className="text-base font-bold text-zinc-100">Admin Dashboard</h2>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1">
                {tabs.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={cn("relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors", tab === t.id ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                        {t.icon} {t.label}
                        {t.badge ? <span className="ml-0.5 bg-red-500 text-white text-[9px] font-black px-1 rounded-full">{t.badge}</span> : null}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="grid grid-cols-2 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                    ) : stats ? (
                        <div className="grid grid-cols-2 gap-3">
                            <StatCard label="Total Users" value={stats.users} icon={<Users className="w-4 h-4" />} color="text-bleu" />
                            <StatCard label="Total Posts" value={stats.posts} icon={<FileText className="w-4 h-4" />} color="text-zinc-400" />
                            <StatCard label="Pending Reports" value={stats.pendingReports} icon={<Flag className="w-4 h-4" />} color="text-red-400" />
                            <StatCard label="Pending Verif." value={stats.pendingVerifications} icon={<Clock className="w-4 h-4" />} color="text-amber-400" />
                        </div>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setTab("reports")} className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/60 border border-white/10 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-2 text-zinc-300">
                                <Flag className="w-4 h-4 text-red-400" />
                                <span className="text-sm font-semibold">Reports Queue</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600" />
                        </button>
                        <button onClick={() => setTab("verification")} className="flex items-center justify-between p-4 rounded-xl bg-zinc-900/60 border border-white/10 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-2 text-zinc-300">
                                <Shield className="w-4 h-4 text-amber-400" />
                                <span className="text-sm font-semibold">Verification Queue</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600" />
                        </button>
                    </div>
                </div>
            )}

            {tab === "reports" && <ReportsTab />}
            {tab === "verification" && <VerificationTab />}
            {tab === "scopes" && <ScopeRequestsTab />}
            {tab === "users" && <UsersTab />}
        </div>
    );
}
