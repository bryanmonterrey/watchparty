// lib/types.ts  💎 PURE AUGMENTATION | IntelliSense EVERYWHERE

// 🔑 Server-side types (for better-auth)
declare module "better-auth" {
    interface User {
        id: string;
        wallet_address: string | null;
        avatar_url?: string | null;
        username?: string | null;
        bio?: string | null;
        role: "admin" | "user" | null;
        last_signed_in?: Date | null;
    }

    interface Session {
        user: User & {
            canAdmin: boolean;  // role === "admin"
        };
    }
}

// 🔑 Client-side types (for better-auth/client)
declare module "better-auth/client" {
    interface User {
        id: string;
        wallet_address: string | null;
        avatar_url?: string | null;
        username?: string | null;
        bio?: string | null;
        role: "admin" | "user" | null;
        last_signed_in?: string | null;
    }

    interface Session {
        user: User & {
            canAdmin: boolean;  // role === "admin"
        };
    }
}

// 🔑 React client types (for better-auth/react)
declare module "better-auth/react" {
    interface User {
        id: string;
        wallet_address: string | null;
        avatar_url?: string | null;
        username?: string | null;
        bio?: string | null;
        role: "admin" | "user" | null;
        last_signed_in?: string | null;
    }

    interface Session {
        user: User & {
            canAdmin: boolean;  // role === "admin"
        };
    }
}