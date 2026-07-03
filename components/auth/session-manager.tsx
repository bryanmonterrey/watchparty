"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Monitor, Smartphone, Tablet, Globe, Clock, Shield, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { useSessions, useRevokeSession, useRevokeAllOtherSessions } from "@/hooks/use-sessions";

interface Session {
    id: string;
    token: string;
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
}

export default function SessionManager() {
    const { data: sessions = [], isLoading, error } = useSessions();
    const revokeSession = useRevokeSession();
    const revokeAllOtherSessions = useRevokeAllOtherSessions();

    const [showRevokeAllDialog, setShowRevokeAllDialog] = useState(false);

    const handleRevokeSession = (sessionToken: string) => {
        revokeSession.mutate(sessionToken);
    };

    const handleRevokeAllOtherSessions = () => {
        revokeAllOtherSessions.mutate(undefined, {
            onSuccess: () => {
                setShowRevokeAllDialog(false);
            },
        });
    };

    const getDeviceIcon = (userAgent?: string) => {
        if (!userAgent) return Monitor;
        const ua = userAgent.toLowerCase();
        if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
            return Smartphone;
        }
        if (ua.includes("tablet") || ua.includes("ipad")) {
            return Tablet;
        }
        return Monitor;
    };

    const getDeviceName = (userAgent?: string) => {
        if (!userAgent) return "Unknown Device";

        const ua = userAgent.toLowerCase();
        let browser = "Unknown Browser";
        let os = "Unknown OS";

        // Detect browser
        if (ua.includes("chrome")) browser = "Chrome";
        else if (ua.includes("firefox")) browser = "Firefox";
        else if (ua.includes("safari")) browser = "Safari";
        else if (ua.includes("edge")) browser = "Edge";

        // Detect OS
        if (ua.includes("windows")) os = "Windows";
        else if (ua.includes("mac")) os = "macOS";
        else if (ua.includes("linux")) os = "Linux";
        else if (ua.includes("android")) os = "Android";
        else if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad")) os = "iOS";

        return `${browser} on ${os}`;
    };

    const formatTimeAgo = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const currentSessionId = authClient.$store.session.data?.session?.id;

    return (
        <Skeleton name="session-manager" loading={isLoading}>
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold">Active Sessions</h2>
                </div>
                {sessions.length > 1 && (
                    <Button
                        onClick={() => setShowRevokeAllDialog(true)}
                        variant="destructive"
                        size="sm"
                        disabled={revokeAllOtherSessions.isPending}
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Revoke All Others
                    </Button>
                )}
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-3xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <p className="text-red-500 text-sm">{error.message || "Failed to load sessions"}</p>
                </div>
            )}

            {/* Sessions List */}
            {sessions.length === 0 ? (
                <div className="bg-greyy/25 rounded-3xl p-8 text-center">
                    <Shield className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
                    <p className="text-neutral-400">No active sessions</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {sessions.map((session) => {
                        const DeviceIcon = getDeviceIcon(session.userAgent);
                        const isCurrentSession = session.id === currentSessionId;

                        return (
                            <div
                                key={session.id}
                                className={`bg-greyy/25 rounded-3xl p-4 border ${isCurrentSession
                                    ? "border-blue-500/30 bg-blue-500/5"
                                    : "border-neutral-800/10"
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="p-2 bg-greyy/25 rounded-lg">
                                            <DeviceIcon className="w-5 h-5 text-neutral-400" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-white">
                                                    {getDeviceName(session.userAgent)}
                                                </p>
                                                {isCurrentSession && (
                                                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-neutral-400">
                                                <div className="flex items-center gap-1">
                                                    <Globe className="w-3 h-3" />
                                                    <span>{session.ipAddress || "Unknown IP"}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{formatTimeAgo(session.createdAt)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {!isCurrentSession && (
                                        <Button
                                            onClick={() => handleRevokeSession(session.token)}
                                            variant="outline"
                                            size="sm"
                                            disabled={revokeSession.isPending}
                                            className="ml-4 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-300 border-none"
                                        >
                                            {revokeSession.isPending ? (
                                                "Revoking..."
                                            ) : (
                                                <>
                                                    <Trash2 className="w-4 h-4 mr-2" />
                                                    Revoke
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Revoke All Dialog */}
            <Dialog open={showRevokeAllDialog} onOpenChange={setShowRevokeAllDialog}>
                <DialogContent className="border-neutral-800">
                    <DialogHeader>
                        <DialogTitle className="text-white">Revoke All Other Sessions?</DialogTitle>
                        <DialogDescription className="text-neutral-400">
                            This will sign you out of all other devices. You'll remain signed in on this device.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-3 mt-4">
                        <Button
                            onClick={() => setShowRevokeAllDialog(false)}
                            variant="outline"
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRevokeAllOtherSessions}
                            variant="destructive"
                            className="flex-1"
                            disabled={revokeAllOtherSessions.isPending}
                        >
                            {revokeAllOtherSessions.isPending ? "Revoking..." : "Revoke All"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
        </Skeleton>
    );
}
