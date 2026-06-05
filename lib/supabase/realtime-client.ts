'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Singleton Realtime Client
 * 
 * This module provides a single, isolated Supabase client specifically for Realtime operations.
 * Using multiple client instances causes GoTrueClient conflicts and CHANNEL_ERROR issues.
 * 
 * Usage:
 * 1. Call `getRealtimeClient()` to get the singleton client
 * 2. Call `setRealtimeAuth(token)` to authenticate it
 * 3. Use the client to create channels
 */

let realtimeClient: SupabaseClient | null = null;
let isAuthenticated = false;
let authPromise: Promise<void> | null = null;

export function getRealtimeClient(): SupabaseClient {
    if (!realtimeClient) {
        console.log('[RealtimeClient] Creating singleton client');
        realtimeClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false,
                    storageKey: 'realtime-singleton',
                    storage: {
                        getItem: () => null,
                        setItem: () => { },
                        removeItem: () => { },
                    },
                },
                realtime: {
                    params: {
                        eventsPerSecond: 10,
                    }
                }
            }
        );
    }
    return realtimeClient;
}

export async function authenticateRealtimeClient(): Promise<void> {
    const client = getRealtimeClient();

    // If authentication is in progress, wait for it
    if (authPromise) {
        console.log('[RealtimeClient] Auth in progress, waiting...');
        return authPromise;
    }

    // Start authentication
    console.log('[RealtimeClient] Starting authentication...');
    authPromise = (async () => {
        try {
            const response = await fetch('/api/auth/supabase-token');
            const data = await response.json();

            if (!data.token) {
                throw new Error(data.error || 'Failed to get token');
            }

            client.realtime.setAuth(data.token);

            if (!client.realtime.isConnected()) {
                console.log('[RealtimeClient] Connecting WebSocket...');
                client.realtime.connect();
            }

            isAuthenticated = true;
            console.log('[RealtimeClient] Authenticated successfully');
        } catch (error) {
            console.error('[RealtimeClient] Authentication failed:', error);
            throw error;
        } finally {
            authPromise = null;
        }
    })();

    return authPromise;
}

export function isRealtimeAuthenticated(): boolean {
    return isAuthenticated;
}

// For cleanup on logout/unmount of the entire app
export function disconnectRealtimeClient(): void {
    if (realtimeClient) {
        console.log('[RealtimeClient] Disconnecting');
        realtimeClient.realtime.disconnect();
        isAuthenticated = false;
    }
}
