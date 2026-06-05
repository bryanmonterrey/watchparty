import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useAuthSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: async () => {
            const { data } = await authClient.getSession();
            return data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnMount: true,
        refetchOnWindowFocus: true, // Refetch when window regains focus (e.g. after passkey dialog)
    });
}
