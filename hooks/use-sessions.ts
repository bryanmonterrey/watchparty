import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";
import { toast } from "sonner";

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

// Query hook for fetching sessions
export function useSessions() {
    return useQuery({
        queryKey: ["sessions"],
        queryFn: async (): Promise<Session[]> => {
            const { data, error } = await authClient.listSessions();

            if (error) {
                throw new Error(error.message || "Failed to load sessions");
            }

            // Better Auth returns sessions array directly
            return Array.isArray(data) ? data : (data?.sessions || []);
        },
        staleTime: 30 * 1000, // 30 seconds
        refetchInterval: 30 * 1000, // Refetch every 30 seconds
    });
}

// Mutation hook for revoking a session
export function useRevokeSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (sessionToken: string) => {
            const { error } = await authClient.revokeSession({ token: sessionToken });

            if (error) {
                throw new Error(error.message || "Failed to revoke session");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            toast.success("Session revoked successfully!");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to revoke session");
        },
    });
}

// Mutation hook for revoking all other sessions
export function useRevokeAllOtherSessions() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            const { error } = await authClient.revokeOtherSessions();

            if (error) {
                throw new Error(error.message || "Failed to revoke sessions");
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["sessions"] });
            toast.success("All other sessions revoked successfully!");
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : "Failed to revoke sessions");
        },
    });
}
