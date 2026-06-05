"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { Monitor, Smartphone, Globe, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface SessionInfo {
    id: string;
    token: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    current?: boolean;
}

function deviceIcon(userAgent?: string | null) {
    if (!userAgent) return <Globe className="w-4 h-4" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return <Smartphone className="w-4 h-4" />;
    return <Monitor className="w-4 h-4" />;
}

function deviceLabel(userAgent?: string | null) {
    if (!userAgent) return "Unknown device";
    const ua = userAgent;
    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
    const browser = browserMatch ? browserMatch[1] : "Browser";
    if (/iPhone|iPad/.test(ua)) return `${browser} on iOS`;
    if (/Android/.test(ua)) return `${browser} on Android`;
    if (/Macintosh/.test(ua)) return `${browser} on Mac`;
    if (/Windows/.test(ua)) return `${browser} on Windows`;
    if (/Linux/.test(ua)) return `${browser} on Linux`;
    return browser;
}

export function SessionManager() {
    const [sessions, setSessions] = useState<SessionInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [revoking, setRevoking] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const result = await authClient.listSessions();
            setSessions((result.data ?? []) as SessionInfo[]);
        } catch {
            toast.error("Failed to load sessions");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    async function revoke(token: string) {
        setRevoking(token);
        try {
            await authClient.revokeSession({ token });
            setSessions(prev => prev.filter(s => s.token !== token));
            toast.success("Session revoked");
        } catch {
            toast.error("Failed to revoke session");
        } finally {
            setRevoking(null);
        }
    }

    async function revokeAll() {
        setRevoking("all");
        try {
            await authClient.revokeOtherSessions();
            await load();
            toast.success("All other sessions revoked");
        } catch {
            toast.error("Failed to revoke sessions");
        } finally {
            setRevoking(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-lantern" />
                    <h2 className="text-base font-bold text-zinc-100">Active Sessions</h2>
                </div>
                {sessions.length > 1 && (
                    <button
                        onClick={revokeAll}
                        disabled={revoking === "all"}
                        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                        {revoking === "all" ? "Revoking…" : "Sign out all others"}
                    </button>
                )}
            </div>

            {loading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">No active sessions found</p>
            ) : (
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 divide-y divide-white/5">
                    {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="p-2 rounded-lg bg-white/5 text-zinc-400 shrink-0">
                                {deviceIcon(s.userAgent)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-zinc-200 truncate">
                                        {deviceLabel(s.userAgent)}
                                    </p>
                                    {s.current && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-lantern/20 text-lantern shrink-0">
                                            This device
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-500">
                                    {s.ipAddress && `${s.ipAddress} · `}
                                    Active {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                                </p>
                            </div>
                            {!s.current && (
                                <button
                                    onClick={() => revoke(s.token)}
                                    disabled={revoking === s.token}
                                    className="p-1.5 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                                    title="Revoke session"
                                >
                                    {revoking === s.token ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
