// app/api/update-profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { invalidateCache } from "@/lib/cache";

export async function POST(req: NextRequest) {
    try {
        // Verify user session
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const userId = session.user.id;
        const contentType = req.headers.get("content-type") || "";

        let username: string | null = null;
        let displayName: string | null = null;
        let bio: string | null = null;
        let avatarFile: File | null = null;

        // Handle both JSON (username only) and FormData (avatar only or both)
        if (contentType.includes("application/json")) {
            const body = await req.json();
            username = body.username;
            displayName = body.displayName;
            bio = body.bio;
        } else {
            const formData = await req.formData();
            username = formData.get("username") as string | null;
            displayName = formData.get("displayName") as string | null;
            bio = formData.get("bio") as string | null;
            avatarFile = formData.get("avatar") as File | null;
        }

        // Prepare update object
        const updateData: any = {
            updatedAt: new Date(),
        };

        // Handle username update
        if (username) {
            // Check if username is already taken
            const existingUser = await db
                .select()
                .from(user)
                .where(eq(user.username, username))
                .limit(1);

            if (existingUser.length > 0 && existingUser[0].id !== userId) {
                return NextResponse.json(
                    { error: "Username is already taken" },
                    { status: 400 }
                );
            }

            updateData.username = username;
        }

        // Handle display name update
        if (displayName !== null) {
            updateData.name = displayName;
        }

        // Handle bio update
        if (bio !== null) {
            updateData.bio = bio;
        }

        // Handle avatar upload
        if (avatarFile) {
            try {
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );

                const fileExt = avatarFile.name.split(".").pop();
                const fileName = `${userId}-${Date.now()}.${fileExt}`;
                const filePath = fileName;

                // Convert File to ArrayBuffer
                const arrayBuffer = await avatarFile.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                const { error: uploadError } = await supabase.storage
                    .from("avatars")
                    .upload(filePath, buffer, {
                        contentType: avatarFile.type,
                        upsert: true,
                    });

                if (uploadError) {
                    console.error("Avatar upload error:", uploadError);
                    throw new Error("Failed to upload avatar");
                }

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from("avatars")
                    .getPublicUrl(filePath);

                updateData.avatar_url = publicUrl;
            } catch (error) {
                console.error("Avatar processing error:", error);
                return NextResponse.json(
                    { error: "Failed to upload avatar" },
                    { status: 500 }
                );
            }
        }

        // Only update if there's something to update
        if (Object.keys(updateData).length === 1) {
            // Only updatedAt, nothing else to update
            return NextResponse.json(
                { error: "No data to update" },
                { status: 400 }
            );
        }

        // Update user profile
        await db
            .update(user)
            .set(updateData)
            .where(eq(user.id, userId));

        // Bust the customSession Redis cache so the next getSession returns fresh data
        await invalidateCache(`user:profile:${userId}`);

        return NextResponse.json({
            success: true,
            username: updateData.username || session.user.username,
            avatar_url: updateData.avatar_url || session.user.avatar_url,
        });
    } catch (error) {
        console.error("❌ Failed to update profile:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
}
