import { trpc } from "@/lib/trpc/client";

export function useAuditLogs() {
    return trpc.auditLog.list.useQuery();
}
