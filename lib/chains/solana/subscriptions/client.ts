// Thin kit RPC factory. The Subscriptions SDK is @solana/kit-based; everything
// here builds kit instructions / reads kit accounts. UI code converts the
// instructions to legacy web3.js via ./compat before signing with the existing
// wallet-adapter; the server collector signs with kit directly (./collector).
import { createSolanaRpc } from "@solana/kit";
import { getRpcUrl } from "./constants";

export function getKitRpc() {
    return createSolanaRpc(getRpcUrl());
}
