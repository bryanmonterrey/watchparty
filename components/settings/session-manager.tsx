"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { ComputerIcon, Delete02Icon, Globe02Icon, Loading03Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { EmptyState, Panel, PanelHeader, PanelSkeleton } from "@/components/settings/ui";

interface SessionInfo {
    id: string;
    token: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    current?: boolean;
}

function deviceIcon(userAgent?: string | null): IconSvgElement {
    if (!userAgent) return Globe02Icon;
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) return SmartPhone01Icon;
    return ComputerIcon;
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
            <PanelHeader
                title="Active sessions"
                action={sessions.length > 1 && (
                    <button
                        onClick={revokeAll}
                        disabled={revoking === "all"}
                        className="cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold text-pastelred transition-colors hover:bg-pastelred/10 disabled:opacity-40"
                    >
                        {revoking === "all" ? "Revoking…" : "Sign out all others"}
                    </button>
                )}
            />

            {loading ? (
                <PanelSkeleton rows={3} rowClassName="h-16" />
            ) : sessions.length === 0 ? (
                <EmptyState title="No active sessions" hint="Sessions appear here when you sign in on a device" />
            ) : (
                <Panel className="p-1.5">
                    {sessions.map(s => (
                        <div key={s.id} className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                            <div className="shrink-0 rounded-full bg-white/5 p-2 text-zinc-400">
                                <HugeiconsIcon icon={deviceIcon(s.userAgent)} className="size-4" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="truncate text-[14px] font-semibold text-zinc-200">
                                        {deviceLabel(s.userAgent)}
                                    </p>
                                    {s.current && (
                                        <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[11px] font-bold text-white">
                                            This device
                                        </span>
                                    )}
                                </div>
                                <p className="text-[12px] font-medium text-zinc-500">
                                    {s.ipAddress && `${s.ipAddress} · `}
                                    Active {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                                </p>
                            </div>
                            {!s.current && (
                                <button
                                    onClick={() => revoke(s.token)}
                                    disabled={revoking === s.token}
                                    className="shrink-0 cursor-pointer rounded-full p-2 text-zinc-600 transition-colors hover:bg-pastelred/10 hover:text-pastelred disabled:opacity-40"
                                    title="Revoke session"
                                >
                                    <HugeiconsIcon icon={revoking === s.token ? Loading03Icon : Delete02Icon} className={revoking === s.token ? "size-4 animate-spin" : "size-4"} strokeWidth={2} />
                                </button>
                            )}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
