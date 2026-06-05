import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/db";
import { userEncryptionKeys } from "@/db/schema/messaging";
import { eq } from "drizzle-orm";

export const encryptionRouter = router({
    /**
     * Get user's public encryption key (Safe for sharing)
     */
    getPublicKey: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ input }) => {
            const key = await db
                .select()
                .from(userEncryptionKeys)
                .where(eq(userEncryptionKeys.userId, input.userId))
                .limit(1);

            if (!key.length) {
                return {
                    success: false,
                    publicKey: null,
                    keyVersion: null,
                };
            }

            return {
                success: true,
                publicKey: key[0].publicKey,
                keyVersion: key[0].keyVersion,
            };
        }),

    /**
     * Get user's encryption key pair (Private + Public)
     * Used for syncing keys across devices
     */
    getKeyPair: protectedProcedure
        .input(z.object({ userId: z.string() }))
        .query(async ({ ctx, input }) => {
            // Only allow fetching own private key
            if (ctx.user.id !== input.userId) {
                // If fetching for others, only return public key (legacy support or just safety)
                // But typically this endpoint is for SELF sync
                return {
                    success: false,
                    publicKey: null,
                    privateKey: null,
                    keyVersion: null,
                    error: "Cannot fetch private keys for other users"
                };
            }

            const key = await db
                .select()
                .from(userEncryptionKeys)
                .where(eq(userEncryptionKeys.userId, input.userId))
                .limit(1);

            if (!key.length) {
                return {
                    success: false,
                    publicKey: null,
                    privateKey: null,
                    keyVersion: null,
                };
            }

            return {
                success: true,
                publicKey: key[0].publicKey,
                privateKey: key[0].privateKey, // Now returning the encrypted private key
                keyVersion: key[0].keyVersion,
            };
        }),

    /**
     * Upload user's encryption key pair
     * Used when initializing keys on a new device (if none exist)
     */
    uploadKeyPair: protectedProcedure
        .input(
            z.object({
                publicKey: z.string(), // Base64 encoded ECDH P-256 public key
                privateKey: z.string(), // Encrypted private key (base64)
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Upsert keys
            await db
                .insert(userEncryptionKeys)
                .values({
                    userId: ctx.user.id,
                    publicKey: input.publicKey,
                    privateKey: input.privateKey,
                })
                .onConflictDoUpdate({
                    target: userEncryptionKeys.userId,
                    set: {
                        publicKey: input.publicKey,
                        privateKey: input.privateKey,
                        updatedAt: new Date(),
                    },
                });

            return {
                success: true,
            };
        }),

    /**
     * Get multiple users' public keys (for group chats)
     */
    getMultiplePublicKeys: protectedProcedure
        .input(z.object({ userIds: z.array(z.string()) }))
        .query(async ({ input }) => {
            const keys = await db
                .select()
                .from(userEncryptionKeys)
                .where(eq(userEncryptionKeys.userId, input.userIds[0])); // TODO: Fix this to use IN clause

            return {
                success: true,
                keys: keys.map((k) => ({
                    userId: k.userId,
                    publicKey: k.publicKey,
                    keyVersion: k.keyVersion,
                })),
            };
        }),
});
