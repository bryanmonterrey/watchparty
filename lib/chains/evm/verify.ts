import { createPublicClient, http, defineChain, type Address, type Hex } from "viem";
import { base, mainnet } from "viem/chains";

// Hyperliquid HyperEVM (not in viem/chains).
const hyperEvm = defineChain({
  id: 999,
  name: "Hyperliquid",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.hyperliquid.xyz/evm"] } },
});

function clientFor(chainId: number) {
  if (chainId === 1) return createPublicClient({ chain: mainnet, transport: http() });
  if (chainId === 999) return createPublicClient({ chain: hyperEvm, transport: http() });
  return createPublicClient({ chain: base, transport: http() });
}

// Server-side SIWE signature check. viem.verifyMessage validates EOA signatures
// AND smart-wallet signatures (ERC-1271 / ERC-6492) — needed for Base Account.
export async function verifyEvmMessage(args: {
  message: string;
  signature: string;
  address: string;
  chainId: number;
}): Promise<boolean> {
  try {
    return await clientFor(args.chainId).verifyMessage({
      address: args.address as Address,
      message: args.message,
      signature: args.signature as Hex,
    });
  } catch (e) {
    console.error("[siwe] verifyMessage threw", { address: args.address, chainId: args.chainId, error: e instanceof Error ? e.message : e });
    return false;
  }
}
