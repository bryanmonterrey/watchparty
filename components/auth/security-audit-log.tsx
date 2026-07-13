"use client";

import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Edit02Icon,
    Key01Icon,
    Shield01Icon,
    UserAdd01Icon,
    UserMinus01Icon,
    ViewIcon,
} from "@hugeicons/core-free-icons";
import { Skeleton } from "boneyard-js/react";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { EmptyState, Panel } from "@/components/settings/ui";

type ActionType = "reveal_phrase" | "export_key" | "passkey_added" | "passkey_removed" | "passkey_renamed";

const actionIcons: Record<ActionType, IconSvgElement> = {
    reveal_phrase: ViewIcon,
    export_key: Key01Icon,
    passkey_added: UserAdd01Icon,
    passkey_removed: UserMinus01Icon,
    passkey_renamed: Edit02Icon,
};

const actionLabels: Record<ActionType, string> = {
    reveal_phrase: "Recovery phrase revealed",
    export_key: "Private key exported",
    passkey_added: "Passkey added",
    passkey_removed: "Passkey removed",
    passkey_renamed: "Passkey renamed",
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
        if (userAgent.includes("Mobile")) return "Mobile";
        if (userAgent.includes("Tablet")) return "Tablet";
        return "Desktop";
    };

    return (
        <Skeleton
            name="security-audit-log"
            loading={isLoading}
        >
        <div className="space-y-4">
            {/* Header */}
            <h2 className="text-[16px] font-bold tracking-tight text-white">Security & audit log</h2>

            {/* Stats */}
            <div className="grid w-full grid-cols-3 gap-3">
                <Panel className="p-4">
                    <p className="text-[12px] font-medium text-zinc-500">Events</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-white">{logs.length}</p>
                </Panel>
                <Panel className="p-4">
                    <p className="text-[12px] font-medium text-zinc-500">Reveals</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-white">
                        {logs.filter((l) => l.action === "reveal_phrase").length}
                    </p>
                </Panel>
                <Panel className="p-4">
                    <p className="text-[12px] font-medium text-zinc-500">Exports</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-white">
                        {logs.filter((l) => l.action === "export_key").length}
                    </p>
                </Panel>
            </div>

            {/* Audit Log Cards */}
            {logs.length === 0 ? (
                <EmptyState title="No security events" hint="Sensitive actions like key exports get recorded here" />
            ) : (
                <Panel className="w-full p-1.5">
                    {logs.map((log) => {
                        const icon = actionIcons[log.action as ActionType] || Shield01Icon;
                        const label = actionLabels[log.action as ActionType] || log.action;
                        return (
                            <div
                                key={log.id}
                                className="flex items-center justify-between gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex size-10 items-center justify-center rounded-full bg-white/5">
                                        <HugeiconsIcon icon={icon} className="size-5 text-zinc-400" strokeWidth={2} />
                                    </div>
                                    <div>
                                        <h3 className="text-[14px] font-semibold text-white">
                                            {label}
                                        </h3>
                                        <p className="text-[12px] font-medium text-zinc-500">
                                            {getDeviceInfo(log.userAgent || "")} · {log.ipAddress} · {formatDate(log.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${log.success
                                        ? "bg-white/10 text-white"
                                        : "bg-pastelred/15 text-pastelred"
                                        }`}
                                >
                                    {log.success ? "Success" : "Failed"}
                                </span>
                            </div>
                        );
                    })}
                </Panel>
            )}
        </div>
        </Skeleton>
    );
}
