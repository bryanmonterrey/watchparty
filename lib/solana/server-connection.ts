import { Connection } from "@solana/web3.js";

/**
 * Workers-safe web3.js Connection for server code.
 *
 * On Cloudflare, workerd's Node compat makes web3.js take its Node path: it
 * attaches a keepAlive http.Agent to every RPC request, and workerd's
 * node:http does not implement the agent's `createConnection` — every call
 * dies with ERR_OPTION_NOT_IMPLEMENTED (seen live on wallet.frostSetup,
 * alongside isolate memory-limit kills from the retry storm).
 *
 * Forcing the platform fetch and disabling the agent keeps RPC on the
 * Workers-native fetch path. Use this for EVERY server-side Connection;
 * never call `new Connection(...)` directly in routers/lib.
 */
export function createServerConnection(
    url: string = (process.env.HELIUS_RPC_URL ?? process.env.NEXT_PUBLIC_HELIUS_RPC_URL)!,
): Connection {
    return new Connection(url, {
        commitment: "confirmed",
        httpAgent: false,
        fetch: ((input: any, init: any) => globalThis.fetch(input, init)) as any,
    });
}
