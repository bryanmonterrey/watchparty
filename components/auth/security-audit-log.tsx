"use client";

import { Shield, Eye, Key, UserPlus, UserMinus, Edit } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { useAuditLogs } from "@/hooks/use-audit-logs";

type ActionType = "reveal_phrase" | "export_key" | "passkey_added" | "passkey_removed" | "passkey_renamed";

const actionIcons: Record<ActionType, typeof Eye> = {
    reveal_phrase: Eye,
    export_key: Key,
    passkey_added: UserPlus,
    passkey_removed: UserMinus,
    passkey_renamed: Edit,
};

const actionLabels: Record<ActionType, string> = {
    reveal_phrase: "Recovery Phrase Revealed",
    export_key: "Private Key Exported",
    passkey_added: "Passkey Added",
    passkey_removed: "Passkey Removed",
    passkey_renamed: "Passkey Renamed",
};

export default function SecurityAuditLog() {
    const { data, isLoading } = useAuditLogs();
    const logs = data?.logs || [];

    const formatDate = (dateString: string | Date) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    };

    const getDeviceInfo = (userAgent: string) => {
        if (userAgent.includes("Mobile")) return "📱 Mobile";
        if (userAgent.includes("Tablet")) return "📲 Tablet";
        return "💻 Desktop";
    };

    return (
        <Skeleton
            name="security-audit-log"
            loading={isLoading}
        >
        <div className="space-y-4 flex flex-col items-start justify-center">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-xl font-bold">Security & Audit Log</h2>
                </div>

            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 w-full">
                <div className="bg-greyy/25  col-span-1 rounded-3xl p-4">
                    <p className="text-neutral-400 text-sm">Events</p>
                    <p className="text-2xl font-bold text-white mt-1">{logs.length}</p>
                </div>
                <div className="bg-greyy/25 col-span-1 rounded-3xl p-4">
                    <p className="text-neutral-400 text-sm">Reveals</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        {logs.filter((l) => l.action === "reveal_phrase").length}
                    </p>
                </div>
                <div className="bg-greyy/25 col-span-1 rounded-3xl p-4">
                    <p className="text-neutral-400 text-sm">Exports</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        {logs.filter((l) => l.action === "export_key").length}
                    </p>
                </div>
            </div>

            {/* Audit Log Cards */}
            <div className="w-full space-y-2">
                {logs.length === 0 ? (
                    <div className="bg-greyy/25 rounded-3xl p-8 text-center">
                        <Shield className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Security Events</h3>
                        <p className="text-neutral-400 text-sm">
                            No security events have been recorded yet.
                        </p>
                    </div>
                ) : (
                    logs.map((log) => {
                        const Icon = actionIcons[log.action as ActionType] || Shield;
                        const label = actionLabels[log.action as ActionType] || log.action;
                        return (
                            <div
                                key={log.id}
                                className="bg-greyy/25 rounded-3xl p-4 flex items-center justify-between transition-colors hover:bg-neutral-800/60"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-white">
                                            {label}
                                        </h3>
                                        <p className="text-sm text-neutral-400">
                                            {getDeviceInfo(log.userAgent || "")} • {log.ipAddress} • {formatDate(log.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <span
                                        className={`px-2 py-1 text-xs rounded-full ${log.success
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-red-500/20 text-red-400"
                                            }`}
                                    >
                                        {log.success ? "Success" : "Failed"}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
        </Skeleton>
    );
}
