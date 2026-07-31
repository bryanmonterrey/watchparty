"use client";

import { create } from "zustand";

export interface CoinOverlaySelection {
    id: string;
    network: string;
    tokenAddress: string;
    poolAddress: string;
    symbol: string;
    name: string | null;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    priceChange24h: number | null;
    buys24h: number | null;
    sells24h: number | null;
    txns24h: number | null;
}

type CoinOverlayStore = {
    coin: CoinOverlaySelection | null;
    onOpen: (coin: CoinOverlaySelection) => void;
    onClose: () => void;
};

export const useCoinOverlay = create<CoinOverlayStore>((set) => ({
    coin: null,
    onOpen: (coin) => set({ coin }),
    onClose: () => set({ coin: null }),
}));
