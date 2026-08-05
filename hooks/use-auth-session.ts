import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

export function useAuthSession() {
    return useQuery({
        queryKey: ["session"],
        queryFn: async () => {
            // The error was being discarded and only `data` returned, so a
            // FAILED request became `null` — indistinguishable from "signed
            // out". Everything downstream believed it: the header offered Sign
            // In to a signed-in user, and the wallet button's auto sign-in
            // fired a signature prompt at one.
            //
            // Throwing instead makes it a query error, which retries and keeps
            // the previous session as `data` rather than replacing it with a
            // wrong answer. A genuine null still returns null — signed out is a
            // real state now that anonymous browsing is on.
            const { data, error } = await authClient.getSession();
            if (error) throw new Error(error.message ?? "session request failed");
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
