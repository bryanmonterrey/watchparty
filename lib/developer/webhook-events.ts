// The developer-webhook event catalog — the single source of truth for what
// a webhook endpoint can subscribe to. The console vendors a copy
// (console/lib/webhook-events.ts — its bundler must not import across the
// app boundary), drift-guarded by tests/console-webhook-events.test.ts.
//
// Scope rule (v1): every event is about the SUBSCRIBER'S OWN account — your
// stream, your followers, your coins, your markets. That keeps volume
// bounded per account; platform-wide firehoses are a different product
// (event subscriptions / streaming rules) with different economics.

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

/** Always deliverable via "Send test" regardless of subscriptions. */
export const WEBHOOK_TEST_EVENT = "webhook.test" as const;

export const WEBHOOK_EVENT_TYPES = WEBHOOK_EVENTS.map((e) => e.type) as [
  WebhookEventType,
  ...WebhookEventType[],
];
