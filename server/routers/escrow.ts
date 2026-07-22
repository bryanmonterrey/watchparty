import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { db } from "@/db";
import { escrows, tokens } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { eq, and } from "drizzle-orm";
import bs58 from "bs58";
import { nanoid } from "nanoid";

// web3.js + the Meteora fee-sharing SDK (anchor-based, heavy) load lazily —
// eager imports here ride into every tRPC isolate via the appRouter graph.

export const escrowRouter = router({
    getMyPendingEscrows: protectedProcedure.query(async ({ ctx }) => {
        const username = ctx.session.user.username;
        if (!username) return [];

        return await db
            .select()
            .from(escrows)
            .where(
                and(
                    eq(escrows.username, username),
                    eq(escrows.status, "pending")
                )
            );
    }),

    resolveSplits: protectedProcedure
        .input(z.array(z.object({
            address: z.string(),
            percentage: z.number(),
            platform: z.enum(["twitter", "kick", "twitch", "solana", "site"])
        })))
        .mutation(async ({ input }) => {
            const treasuryPubKey = process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
            if (!treasuryPubKey) throw new Error("Treasury Public Key not configured");

            const resolved = await Promise.all(input.map(async (split) => {
                if (split.platform === "solana") {
                    return { ...split, resolvedAddress: split.address, isEscrow: false };
                }

                const cleanedUsername = split.address.replace('@', '');
                const userRecord = await db.query.user.findFirst({
                    where: eq(user.username, cleanedUsername)
                });

                if (userRecord && userRecord.wallet_address) {
                    return { ...split, resolvedAddress: userRecord.wallet_address, isEscrow: false };
                }

                // If not found or user has no wallet, generate a unique Proxy Keypair for this escrow claim
                const { Keypair } = await import("@solana/web3.js");
                const proxyKeypair = Keypair.generate();
                const proxyPublicKey = proxyKeypair.publicKey.toBase58();
                const proxyPrivateKey = bs58.encode(proxyKeypair.secretKey);

                const escrowId = nanoid();

                // Store in DB immediately as pending
                await db.insert(escrows).values({
                    id: escrowId,
                    tokenId: "pending", // Will be updated when createVideo/createPost completes
                    platform: split.platform,
                    username: split.address,
                    sharePercentage: split.percentage,
                    claimerPrivateKey: proxyPrivateKey,
                    status: "pending"
                });

                return { ...split, resolvedAddress: proxyPublicKey, isEscrow: true, escrowId };
            }));

            return resolved;
        }),

    claimEscrow: protectedProcedure
        .input(z.object({ escrowId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const currentUser = await db.query.user.findFirst({
                where: eq(user.id, ctx.session.user.id)
            });
            if (!currentUser || !currentUser.username || !currentUser.wallet_address) {
                throw new Error("Profile incomplete. Must set username and link wallet.");
            }

            const escrowRecord = await db.query.escrows.findFirst({
                where: eq(escrows.id, input.escrowId)
            });

            if (!escrowRecord) throw new Error("Escrow not found or unavailable");
            if (escrowRecord.username !== currentUser.username) throw new Error("Unauthorized");
            if (escrowRecord.status === "claimed") throw new Error("Already claimed");

            const tokenRecord = await db.query.tokens.findFirst({
                where: eq(tokens.id, escrowRecord.tokenId)
            });

            if (!tokenRecord || !tokenRecord.tokenAddress) {
                throw new Error("Token is not live or does not exist on-chain");
            }

            // 2. Execute On-Chain Claim (Treasury pays gas, Proxy authorizes)
            const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
            if (!treasuryKey) throw new Error("Treasury not configured");

            const [{ Keypair, PublicKey }, { createServerConnection }, { DynamicFeeSharingClient, deriveFeeVaultPdaAddress }] = await Promise.all([
                import("@solana/web3.js"),
                import("@/lib/solana/server-connection"),
                import("@meteora-ag/dynamic-fee-sharing-sdk"),
            ]);
            const treasuryKeypair = Keypair.fromSecretKey(bs58.decode(treasuryKey));
            const proxyKeypair = Keypair.fromSecretKey(bs58.decode(escrowRecord.claimerPrivateKey));

            const connection = createServerConnection();
            const dfsClient = new DynamicFeeSharingClient(connection, "confirmed");

            const baseMint = new PublicKey(tokenRecord.tokenAddress);
            const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111111");
            const feeVaultPda = deriveFeeVaultPdaAddress(baseMint, NATIVE_MINT);

            const claimTx = await dfsClient.claimUserFee2({
                feeVault: feeVaultPda,
                user: proxyKeypair.publicKey,
                payer: treasuryKeypair.publicKey,
                receiver: new PublicKey(currentUser.wallet_address)
            });

            claimTx.feePayer = treasuryKeypair.publicKey;
            claimTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

            claimTx.partialSign(treasuryKeypair, proxyKeypair);

            try {
                const txId = await connection.sendRawTransaction(claimTx.serialize());
                await connection.confirmTransaction(txId, "confirmed");

                // 3. Mark as claimed in Database
                await db.update(escrows)
                    .set({ status: "claimed", updatedAt: new Date() })
                    .where(eq(escrows.id, input.escrowId));

                return { success: true, txId };
            } catch (e: any) {
                console.error("Failed to claim escrow fees:", e);
                throw new Error("Failed to claim on-chain fees: " + e.message);
            }
        }),
});
