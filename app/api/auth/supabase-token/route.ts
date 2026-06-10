import { auth } from "@/lib/auth/server"; // Import auth instance from lib/auth/server
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const secret = process.env.SUPABASE_JWT_SECRET;
        if (!secret) {
            console.error("SUPABASE_JWT_SECRET is not set");
            return NextResponse.json(
                { error: "Server configuration error" },
                { status: 500 }
            );
        }

        // Create a custom token for Supabase
        // "role: authenticated" is required for RLS policies to match "TO authenticated"
        const payload = {
            aud: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour
            sub: session.user.id,
            email: session.user.email,
            role: 'authenticated',
            app_metadata: {
                provider: 'custom',
                providers: ['custom']
            },
            user_metadata: {
                name: session.user.name
            }
        };

        const token = jwt.sign(payload, secret);
        return NextResponse.json({ token });

    } catch (error) {
        console.error("Failed to generate Supabase token:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
