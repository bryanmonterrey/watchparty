// Firehose cost controls — the metering knob for the filtered stream.
//
// The stream is ACCOUNT-BOUNDED today: a developer's rules only ever match
// their OWN account's events (own coins launched, own streams online, etc.),
// which is a bounded, cheap firehose — so delivery is FREE. This module is the
// single place a price turns on, the moment a *paid* firehose (matching events
// beyond the own account) becomes a deliberate product.
//
// To activate paid metering: set STREAM_DELIVERY_PRICE_MICRO to the per-matched-
// delivery price (in USDC micro-units, 1e6 = $1), wire streamDeliveryCostMicro
// into the delivery path's billing, and revisit MIN_POSITIVE_TERMS_PER_RULE if
// the guardrail needs tightening. Until then everything below reads as $0.

/** Price per matched delivery, in USDC micro-units (1_000_000 = $1). 0 = free. */
export const STREAM_DELIVERY_PRICE_MICRO = 0;

/** Cost of N matched deliveries, in micro-units. Zero while the stream is free. */
export function streamDeliveryCostMicro(deliveries: number): number {
    return Math.max(0, Math.round(deliveries)) * STREAM_DELIVERY_PRICE_MICRO;
}

/** Micro-units → a $ string for display. */
export function microToUsd(micro: number): string {
    return `$${(micro / 1_000_000).toFixed(micro % 1_000_000 === 0 ? 2 : 4)}`;
}

/** The write-time / match-time guardrail (already enforced in stream-rules.ts):
 *  every rule must carry at least one POSITIVE term, so an all-negation rule
 *  can't quietly subscribe to the whole firehose. The metering safeguard. */
export const MIN_POSITIVE_TERMS_PER_RULE = 1;
