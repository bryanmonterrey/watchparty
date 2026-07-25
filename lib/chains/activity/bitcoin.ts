// Bitcoin history via mempool.space — free and keyless.
//
// UTXO transactions have no "from"/"to" the way account chains do, so the net
// effect on the queried address is computed: everything it received in outputs
// minus everything it spent in inputs.

import { BITCOIN } from "../registry";
import type { ChainConfig } from "../types";
import type { ActivityProvider, ChainActivity } from "./types";

interface BtcTx {
  txid: string;
  fee: number;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

export const bitcoinActivityProvider: ActivityProvider = {
  kind: "bitcoin",

  async getActivity(address, chain: ChainConfig, limit): Promise<ChainActivity[]> {
    const res = await fetch(`${chain.rpcUrl ?? BITCOIN.rpcUrl}/address/${address}/txs`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`mempool.space returned ${res.status}`);

    const txs = (await res.json()) as BtcTx[];
    const decimals = chain.nativeCurrency.decimals;

    return txs.slice(0, limit).map((tx) => {
      const spent = tx.vin
        .filter((i) => i.prevout?.scriptpubkey_address === address)
        .reduce((sum, i) => sum + (i.prevout?.value ?? 0), 0);
      const received = tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((sum, o) => sum + o.value, 0);

      // Net of change: spending 1 BTC to send 0.1 leaves 0.9 coming back.
      const net = received - spent;
      const isOutgoing = net < 0;

      const counterparty = isOutgoing
        ? tx.vout.find((o) => o.scriptpubkey_address !== address)?.scriptpubkey_address
        : tx.vin.find((i) => i.prevout?.scriptpubkey_address !== address)?.prevout
            ?.scriptpubkey_address;

      return {
        chain: chain.id,
        txId: tx.txid,
        timestamp: tx.status.block_time ?? Math.floor(Date.now() / 1000),
        status: "success" as const,
        isOutgoing,
        // Outgoing shows the amount that actually left, fee excluded.
        amount: Math.abs(isOutgoing ? net + tx.fee : net) / 10 ** decimals,
        symbol: chain.nativeCurrency.symbol,
        contract: null,
        counterparty,
        fee: isOutgoing ? tx.fee / 10 ** decimals : undefined,
        type: "transfer",
        explorerUrl: `${chain.explorer}/tx/${tx.txid}`,
      };
    });
  },
};
