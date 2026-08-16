// Stripe Crypto Onramp — card/bank -> crypto, delivered straight to the user's
// own derived address.
//
// The app already had ONE on-ramp (`lib/moonpay.ts`), and it is Solana-only: it
// hardcodes `currencyCode=sol`, so every other chain we hold keys for had no
// way to be funded at all. This is the second, and it covers the chains MoonPay
// there does not.
//
// Talks to the REST API with plain `fetch` rather than the `stripe` SDK. Two
// reasons, both load-bearing here: the worker is near a 10 MiB gzip ceiling and
// the SDK is not small, and stripe-node needs an explicit fetch HTTP client to
// work on workerd at all. One POST does not justify either.
//
// INERT WITHOUT A KEY, on purpose — `stripeOnrampConfigured()` is false when
// STRIPE_SECRET_KEY is unset, and the UI hides the entry point rather than
// offering a button that 500s. Same shape as the privileged-scope and
// stream-pricing knobs: the mechanism ships, one env var turns it on.

const STRIPE_API = "https://api.stripe.com/v1/crypto/onramp_sessions";

/**
 * Registry chain id -> Stripe's network + the coin worth delivering there.
 *
 * SHORTER than our chain list, and that is the point: Stripe onramps to
 * Ethereum, Base, Polygon, Solana and Bitcoin, and does NOT support BNB Chain,
 * HyperEVM or Robinhood Chain. Those simply have no card funding path, and
 * saying so beats a session that fails after the user has entered card details.
 *
 * The native coin rather than USDC because funding exists here to PAY FOR a
 * swap, and every swap spends gas in the native coin — landing USDC on a chain
 * with no gas leaves the user stuck holding something they cannot move.
 */
const STRIPE_NETWORKS: Record<string, { network: string; currency: string }> = {
    ethereum: { network: "ethereum", currency: "eth" },
    base: { network: "base", currency: "eth" },
    // Stripe still names this one "matic" at the API level even though the
    // token rebranded to POL — do not "correct" it to pol without checking.
    polygon: { network: "polygon", currency: "matic" },
    solana: { network: "solana", currency: "sol" },
    bitcoin: { network: "bitcoin", currency: "btc" },
};

export const stripeOnrampChains = (): string[] => Object.keys(STRIPE_NETWORKS);

export const stripeSupportsChain = (chainId: string): boolean => chainId in STRIPE_NETWORKS;

export const stripeOnrampConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY?.trim();

export type OnrampSession = {
    id: string;
    /** For Stripe's embedded element, if we ever mount it client-side. */
    clientSecret: string;
    /** Hosted flow — what we actually open, matching the MoonPay convention. */
    redirectUrl: string | null;
};

export class StripeOnrampError extends Error {}

/**
 * Create a session that can only ever deliver to `address`.
 *
 * The destination is passed as `wallet_addresses[<network>]` and locked with
 * `destination_networks`/`destination_currencies`, so the hosted page cannot be
 * talked into sending somewhere else — the user picks the amount, never the
 * recipient.
 */
export async function createStripeOnrampSession(opts: {
    chainId: string;
    address: string;
    /** Optional USD amount to prefill. */
    usdAmount?: number;
    customerIp?: string;
}): Promise<OnrampSession> {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new StripeOnrampError("Card funding isn't configured.");

    const target = STRIPE_NETWORKS[opts.chainId];
    if (!target) throw new StripeOnrampError("Card funding isn't available on this chain.");

    const form = new URLSearchParams();
    form.set(`wallet_addresses[${target.network}]`, opts.address);
    form.set("destination_currency", target.currency);
    form.set("destination_network", target.network);
    // Lock the pair down as well as prefill it: without these the hosted page
    // lets the user switch network, and the address we supplied is only valid
    // for the one we asked for.
    form.append("destination_currencies[]", target.currency);
    form.append("destination_networks[]", target.network);
    if (opts.usdAmount && Number.isFinite(opts.usdAmount) && opts.usdAmount > 0) {
        form.set("source_amount", opts.usdAmount.toFixed(2));
    }
    if (opts.customerIp) form.set("customer_ip_address", opts.customerIp);

    const res = await fetch(STRIPE_API, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
    });

    if (!res.ok) {
        // Stripe explains the refusal ("crypto onramp is not enabled for this
        // account" is the common first one), and that is far more useful to
        // surface than the status code.
        let message = `Stripe returned ${res.status}`;
        try {
            const body = (await res.json()) as { error?: { message?: string } };
            if (body?.error?.message) message = body.error.message;
        } catch {
            /* non-JSON body — keep the status */
        }
        throw new StripeOnrampError(message);
    }

    const session = (await res.json()) as {
        id?: string;
        client_secret?: string;
        redirect_url?: string;
    };

    if (!session.id || !session.client_secret) {
        throw new StripeOnrampError("Stripe returned an unusable session.");
    }

    return {
        id: session.id,
        clientSecret: session.client_secret,
        redirectUrl: session.redirect_url ?? null,
    };
}
