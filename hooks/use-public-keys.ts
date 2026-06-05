'use client';

import { trpc } from '@/lib/trpc/client';

/**
 * Hook for fetching a user's public encryption key
 */
export function usePublicKey(userId: string) {
    const { data, isLoading, error } = trpc.encryption.getPublicKey.useQuery(
        { userId },
        { enabled: !!userId }
    );

    return {
        publicKey: data?.publicKey || null,
        keyVersion: data?.keyVersion || null,
        isLoading,
        error,
    };
}



/**
 * Hook for fetching multiple users' public keys (for group chats)
 */
export function useMultiplePublicKeys(userIds: string[]) {
    const { data, isLoading, error } = trpc.encryption.getMultiplePublicKeys.useQuery(
        { userIds },
        { enabled: userIds.length > 0 }
    );

    return {
        keys: data?.keys || [],
        isLoading,
        error,
    };
}
