// VENDORED copy of the developer-webhook event catalog from the main app's
// lib/developer/webhook-events.ts (the bundler must not import across the
// app boundary — see lib/utils.ts). Guarded against drift by
// tests/console-webhook-events.test.ts in the main repo, which deep-compares
// the two and gates deploy.

export const WEBHOOK_EVENTS = [
  {
    type: "stream.online",
    group: "Streams",
    desc: "Your channel goes live",
  },
  {
    type: "stream.offline",
    group: "Streams",
    desc: "Your stream ends or fails",
  },
  {
    type: "user.followed",
    group: "Social",
    desc: "Someone follows you",
  },
  {
    type: "coin.launched",
    group: "Coins",
    desc: "A coin you created goes live (first buy or creator-coin launch)",
  },
  {
    type: "prediction.resolved",
    group: "Predictions",
    desc: "A market you created or bet on resolves",
  },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["type"];

/** Illustrative payloads for the test-delivery preview (§7 playground). */
export const SAMPLE_PAYLOADS: Record<string, object> = {
  "webhook.test": {
    message: "If you can read this, your endpoint and signature verification work.",
  },
  "stream.online": { streamId: "st_1a2b3c4d", sessionId: "st-0aBcDeFgHiJk" },
  "stream.offline": { streamId: "st_1a2b3c4d", sessionId: "st-0aBcDeFgHiJk" },
  "user.followed": { followerId: "usr_9z8y7x6w", followerUsername: "satoshi" },
  "coin.launched": {
    tokenId: "tok_5e6f7a8b",
    tokenAddress: "Ez9…pump",
    ticker: "PARTY",
    imageUrl: "https://watchparty.xyz/…/party.png",
  },
  "prediction.resolved": {
    marketId: "c3d4e5f6-…",
    question: "Will PARTY hit $1M market cap this week?",
    winningOutcome: 0,
    resolvedAt: "2026-08-10T15:00:00.000Z",
  },
};
