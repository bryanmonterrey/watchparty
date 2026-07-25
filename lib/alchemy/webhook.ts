// Alchemy Notify — address registration for the ADDRESS_ACTIVITY webhook.
//
// EVM counterpart to lib/helius/webhook.ts. One webhook watches every user's
// EVM address (the same address across all five EVM chains), and its receiver
// is app/api/webhooks/alchemy-assets.
//
// Note the auth here is the Notify AUTH TOKEN (dashboard → Notify → auth
// token), not ALCHEMY_API_KEY. They are different credentials and the API
// rejects the data-plane key.

const AUTH_TOKEN = process.env.ALCHEMY_AUTH_TOKEN;
const WEBHOOK_ID = process.env.ALCHEMY_WEBHOOK_ID;

const UPDATE_URL = "https://dashboard.alchemy.com/api/update-webhook-addresses";

/**
 * Adds addresses to the ADDRESS_ACTIVITY webhook.
 *
 * Unlike Helius (fetch-merge-PUT the whole list), Alchemy takes an explicit
 * add/remove patch, so this is safe to call concurrently without clobbering
 * another request's additions.
 *
 * No-ops when unconfigured so wallet creation still works before Notify is set
 * up — the wallet just polls until then.
 */
export async function registerAlchemyAddresses(addresses: string[]): Promise<void> {
  if (!AUTH_TOKEN || !WEBHOOK_ID || addresses.length === 0) return;

  const res = await fetch(UPDATE_URL, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "X-Alchemy-Token": AUTH_TOKEN,
    },
    body: JSON.stringify({
      webhook_id: WEBHOOK_ID,
      addresses_to_add: addresses,
      addresses_to_remove: [],
    }),
  });

  if (!res.ok) {
    throw new Error(`Alchemy update-webhook-addresses failed: ${res.status} ${await res.text()}`);
  }
}
