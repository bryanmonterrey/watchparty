import { authClient } from "@/lib/auth/client";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Query hook for fetching passkeys
export function usePasskeys() {
    return trpc.passkey.list.useQuery();
}

// Mutation hook for adding a passkey
export function useAddPasskey() {
    const utils = trpc.useUtils();

    return {
        mutate: async (name?: string, options?: { onSuccess?: () => void; onError?: (error: any) => void }) => {
            const data = utils.passkey.list.getData();
            const passkeys = data?.passkeys || [];
            const passkeyName = name?.trim() || `Passkey ${passkeys.length + 1}`;

            try {
                // better-auth's client returns { data, error } rather than
                // throwing, so a refused registration (403 SESSION_NOT_FRESH,
                // 2026-10-04) sailed into the success toast while nothing was
                // added. Treat a returned error as a thrown one.
                const result = await authClient.passkey.addPasskey({ name: passkeyName });
                if (result && "error" in result && result.error) {
                    const code = (result.error as { code?: string; message?: string }).code;
                    throw new Error(
                        code === "SESSION_NOT_FRESH"
                            ? "Please sign in again before adding a passkey."
                            : (result.error as { message?: string }).message || "Failed to add passkey",
                    );
                }
                utils.passkey.list.invalidate();
                toast.success("Passkey added successfully!");
                options?.onSuccess?.();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to add passkey");
                options?.onError?.(error);
                throw error;
            }
        },
        isPending: false,
    };
}

// Mutation hook for renaming a passkey
export function useRenamePasskey() {
    const utils = trpc.useUtils();

    return trpc.passkey.rename.useMutation({
        onSuccess: () => {
            utils.passkey.list.invalidate();
            toast.success("Passkey renamed successfully!");
        },
        onError: (error) => {
            toast.error(error.message || "Failed to rename passkey");
        },
    });
}

// Mutation hook for deleting a passkey
export function useDeletePasskey() {
    const utils = trpc.useUtils();

    return trpc.passkey.delete.useMutation({
        onSuccess: () => {
            utils.passkey.list.invalidate();
            toast.success("Passkey deleted successfully!");
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete passkey");
        },
    });
}
