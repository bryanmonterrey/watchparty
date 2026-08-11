import { createClient } from '@supabase/supabase-js';
import { assertSameSupabaseProject } from './assert-same-project';

// Server-side only, and a warning rather than a throw: reading production from
// dev is a legitimate setup; not KNOWING which database you are writing is not.
assertSameSupabaseProject();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
        params: {
            eventsPerSecond: 10,
        },
    },
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    },
});

// Helper to get authenticated Supabase client with user session
export async function getAuthenticatedSupabase(sessionToken: string) {
    const client = createClient(supabaseUrl, supabaseAnonKey);

    // Set the session
    await client.auth.setSession({
        access_token: sessionToken,
        refresh_token: sessionToken,
    });

    return client;
}
