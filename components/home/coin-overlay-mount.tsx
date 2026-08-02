"use client";

import dynamic from "next/dynamic";

// Mounts the coin chart overlay for every route that has the alerts rail.
//
// It used to live in home-page-surface, which meant the overlay only existed on
// /home — so an alert row on /feed or a token page had nothing to open and fell
// back to navigating. The rail moved to (rails)/layout.tsx; its overlay follows.
//
// A client component purely so `dynamic(ssr: false)` is legal: the layout that
// renders this is a server component, and the overlay must stay lazy — it pulls
// the TradingView chart and the swap view, which no page should pay for until
// someone actually opens a coin.
const CoinOverlay = dynamic(
    () => import("@/components/home/coin-overlay").then((m) => m.CoinOverlay),
    { ssr: false },
);

export function CoinOverlayMount() {
    return <CoinOverlay />;
}
