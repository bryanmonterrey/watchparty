import { authClient } from "@/lib/auth/client";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Query hook for fetching linked accounts
export function useLinkedAccounts() {
    return trpc.account.list.useQuery();
}

// Mutation hook for linking an account
export function useLinkAccount() {
    return {
        mutate: async (provider: string) => {
            await authClient.linkSocial({
                provider: provider as any,
                callbackURL: window.location.href,
                errorCallbackURL: window.location.href, // Redirect back to this page on error
            });
        },
        isPending: false,
    };
}

// Mutation hook for unlinking an account
export function useUnlinkAccount() {
    const utils = trpc.useUtils();

    return trpc.account.unlink.useMutation({
        onSuccess: () => {
            utils.account.list.invalidate();
            toast.success("Account unlinked successfully!");
        },
        onError: (error) => {
            toast.error(error.message || "Failed to unlink account");
        },
    });
}
