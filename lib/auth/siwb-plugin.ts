// Sign-In With Bitcoin (SIWB) — a custom better-auth plugin modeled on the
// built-in SIWE plugin, but verifying BIP-322 message signatures (bip322-js)
// instead of EVM signatures. Reuses the existing `walletAddress` table with a
// sentinel chainId so no new migration is needed.
//
// Flow (mirrors SIWS/SIWE): POST /siwb/nonce {address} -> {nonce};
// client signs "<statement>\n\nNonce: <nonce>"; POST /siwb/verify
// {message, signature, address} -> session cookie.

import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { Verifier } from "bip322-js";
import * as z from "zod";

// Bitcoin isn't an EVM chain, so it has no numeric chainId — use 0 as the marker
// in the shared walletAddress table (EVM chains are 1/8453/999/…).
export const BITCOIN_CHAIN_ID = 0;

interface SiwbOptions {
  domain: string;
  getNonce: () => Promise<string>;
  nonceTtlSeconds?: number;
}

export const siwbPlugin = (options: SiwbOptions) => {
  const ttl = (options.nonceTtlSeconds ?? 900) * 1000;

  return {
    id: "siwb",
    endpoints: {
      getSiwbNonce: createAuthEndpoint(
        "/siwb/nonce",
        { method: "POST", body: z.object({ address: z.string().min(1) }) },
        async (ctx) => {
          const { address } = ctx.body;
          const nonce = await options.getNonce();
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: `siwb:${address}`,
            value: nonce,
            expiresAt: new Date(Date.now() + ttl),
          });
          return ctx.json({ nonce });
        },
      ),

      verifySiwbMessage: createAuthEndpoint(
        "/siwb/verify",
        {
          method: "POST",
          body: z.object({
            message: z.string().min(1),
            signature: z.string().min(1),
            address: z.string().min(1),
          }),
          requireRequest: true,
        },
        async (ctx) => {
          const { message, signature, address } = ctx.body;
          try {
            const verification = await ctx.context.internalAdapter.findVerificationValue(`siwb:${address}`);
            if (!verification || new Date() > verification.expiresAt) {
              throw new APIError("UNAUTHORIZED", { message: "Invalid or expired nonce" });
            }
            // Anti-replay: the signed message must contain the issued nonce.
            if (!message.includes(verification.value)) {
              throw new APIError("UNAUTHORIZED", { message: "Nonce mismatch" });
            }
            // Verify the BIP-322 signature against the Bitcoin address.
            if (!Verifier.verifySignature(address, message, signature)) {
              throw new APIError("UNAUTHORIZED", { message: "Invalid Bitcoin signature" });
            }
            await ctx.context.internalAdapter.deleteVerificationByIdentifier(`siwb:${address}`);

            // Find or create the user (linked via walletAddress, chainId = bitcoin sentinel).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let user: any = null;
            const existing = await ctx.context.adapter.findOne<{ userId: string }>({
              model: "walletAddress",
              where: [
                { field: "address", operator: "eq", value: address },
                { field: "chainId", operator: "eq", value: BITCOIN_CHAIN_ID },
              ],
            });
            if (existing) {
              user = await ctx.context.adapter.findOne<{ id: string }>({
                model: "user",
                where: [{ field: "id", operator: "eq", value: existing.userId }],
              });
            }
            if (!user) {
              user = await ctx.context.internalAdapter.createUser({
                name: address,
                email: `${address}@${options.domain}`,
                image: "",
              });
              await ctx.context.adapter.create({
                model: "walletAddress",
                data: {
                  userId: user!.id,
                  address,
                  chainId: BITCOIN_CHAIN_ID,
                  isPrimary: true,
                  createdAt: new Date(),
                },
              });
              await ctx.context.internalAdapter.createAccount({
                userId: user!.id,
                providerId: "siwb",
                accountId: address,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
            }

            const session = await ctx.context.internalAdapter.createSession(user!.id);
            if (!session) {
              throw new APIError("INTERNAL_SERVER_ERROR", { message: "Could not create session" });
            }
            await setSessionCookie(ctx, { session, user: user! });
            return ctx.json({ token: session.token, success: true, user: { id: user!.id, address } });
          } catch (error) {
            if (error instanceof APIError) throw error;
            throw new APIError("UNAUTHORIZED", {
              message: error instanceof Error ? error.message : "Bitcoin sign-in failed",
            });
          }
        },
      ),
    },
  };
};
