import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { createClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// ── Supabase admin factory (reused in both procedures) ────────────────────────
function supabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

// ── Router ────────────────────────────────────────────────────────────────────
export const uploadRouter = router({

    getPresignedUrl: protectedProcedure
        .input(z.object({
            bucket: z.enum(["videos", "posts", "attachments", "thumbnails", "avatars", "banners", "stories", "emotes", "sounds", "vault"]),
            filename: z.string().min(1),
            contentType: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const admin = supabaseAdmin();
            const uniqueId = nanoid();
            const path = `${ctx.session.user.id}/${uniqueId}-${input.filename}`;

            const { data, error } = await admin
                .storage
                .from(input.bucket)
                .createSignedUploadUrl(path);

            if (error) {
                console.error("Failed to create signed upload URL:", error);
                throw new Error(`Failed to generate upload URL: ${error.message}`);
            }

            return {
                signedUrl: data.signedUrl,
                path: data.path,
                token: data.token,
                fullPath: path,
            };
        }),

    // ── Transcribe a video using Deepgram Nova-3 (async callback mode) ────────
    // Fires a job at Deepgram and returns immediately. Deepgram POSTs the result
    // to /api/captions/webhook when processing is done (minutes later for long videos).
    transcribeVideo: protectedProcedure
        .input(z.object({
            postId: z.string(),
            videoUrl: z.string().url(),
            language: z.string().nullable().default("en"),
        }))
        .mutation(async ({ ctx, input }) => {
            const post = await db.query.posts.findFirst({
                where: and(eq(posts.id, input.postId), eq(posts.userId, ctx.session.user.id)),
                columns: { id: true },
            });
            if (!post) throw new TRPCError({ code: "FORBIDDEN" });

            if (!process.env.DEEPGRAM_API_KEY) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "DEEPGRAM_API_KEY is not configured",
                });
            }

            if (!process.env.CAPTIONS_WEBHOOK_SECRET) {
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "CAPTIONS_WEBHOOK_SECRET is not configured",
                });
            }

            // Build the callback URL Deepgram will POST to when done
            const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
            const callbackUrl = new URL("/api/captions/webhook", appUrl);
            callbackUrl.searchParams.set("postId", input.postId);
            callbackUrl.searchParams.set("userId", ctx.session.user.id);
            callbackUrl.searchParams.set("language", input.language ?? "auto");
            callbackUrl.searchParams.set("secret", process.env.CAPTIONS_WEBHOOK_SECRET.trim());

            // Lazy — keeps the Deepgram SDK out of the eager appRouter graph
            const { DeepgramClient } = await import("@deepgram/sdk");
            const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (deepgram.listen.v1.media.transcribeUrl as any)({
                url: input.videoUrl,
                model: "nova-3",
                ...(input.language ? { language: input.language } : { detect_language: true }),
                smart_format: true,
                paragraphs: true,
                punctuate: true,
                diarize: false,
                callback: callbackUrl.toString(),
            });

            console.log("[transcribeVideo] queued for postId:", input.postId, "callback:", callbackUrl.toString());
            return { submitted: true };
        }),
});
