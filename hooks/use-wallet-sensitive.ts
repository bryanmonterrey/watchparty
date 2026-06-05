import { trpc } from "@/lib/trpc/client";

export function useRevealPhrase() {
    return trpc.wallet.revealPhrase.useMutation({
        onError: (error) => {
            console.error("Failed to reveal phrase:", error);
        },
    });
}

export function useExportKey() {
    return trpc.wallet.exportKey.useMutation({
        onError: (error) => {
            console.error("Failed to export key:", error);
        },
    });
}
