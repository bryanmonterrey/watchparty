import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useAuthSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: async () => {
            const { data } = await authClient.getSession();
            return data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes — dedupes the many callers
        // "always", not true. `true` only refetches data it already considers
        // STALE, so a null cached inside the staleTime window survives every
        // mount for five minutes — and a null here reads as "signed out"
        // everywhere downstream. That is the whole bug: sign in, get a stale
        // null, and the header says Sign In until a hard refresh builds a fresh
        // QueryClient. Remounting is cheap; being wrong about who you are isn't.
        refetchOnMount: "always",
        refetchOnWindowFocus: true, // Refetch when window regains focus (e.g. after passkey dialog)
        // A dropped request shouldn't read as signed out either.
        retry: 2
    });
}
