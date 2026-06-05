// better-auth-siws ships no types. Declare the plugin factories loosely;
// the siws client actions are accessed via a cast in lib/chains/solana/sign-in.ts.
declare module "better-auth-siws" {
  export const siwsPlugin: (options?: {
    domain?: string;
    statement?: string;
    nonceTtlSeconds?: number;
  }) => any;
}

declare module "better-auth-siws/client" {
  // Typed as a real client plugin so it doesn't collapse authClient inference.
  // The `siws` actions it adds are accessed via a cast in lib/chains/solana/sign-in.ts.
  export const siwsClientPlugin: () => import("better-auth/client").BetterAuthClientPlugin;
}
