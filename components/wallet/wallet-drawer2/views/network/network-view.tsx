"use client";

import * as React from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { CHAINS } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";
import { ChainIcon } from "@/components/wallet/chain-icon";

interface NetworkViewProps {
  onSelect: (chain: ChainId) => void;
  onClose: () => void;
  /**
   * Address kinds this account actually has. Chains outside it are dropped:
   * an extension-only account has no mnemonic, so no address was ever derived
   * for Base or BTC, and offering the network would invite a deposit to
   * nothing. Omit to show every chain.
   */
  availableKinds?: string[];
}

/**
 * "Receive on which network?"
 *
 * The wallet has no network switcher — every other operation infers its chain
 * from the asset being acted on. Receiving is the one case with no asset to
 * infer from, so the choice lives here, at the moment it is actually needed,
 * rather than as a global mode you have to set beforehand.
 */
export function NetworkView({ onSelect, onClose, availableKinds }: NetworkViewProps) {
  const chains = availableKinds
    ? CHAINS.filter((c) => availableKinds.includes(c.kind))
    : CHAINS;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="flex h-full flex-col"
    >
      {/* Same 56px header the rest of the drawer uses; the close control keeps
          its own slot because this screen is dismissed, not backed out of. */}
      <div className="relative flex h-14 flex-shrink-0 items-center px-3">
        <button
          onClick={onClose}
          aria-label="Close"
          className="z-10 grid size-9 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-95"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
        </button>
        <span className="pointer-events-none absolute left-0 right-0 text-center text-15 font-bold tracking-tight text-white">
          Receive on
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {chains.map((chain) => {
          return (
            <button
              key={chain.id}
              onClick={() => onSelect(chain.id)}
              className="group flex w-full cursor-pointer items-center gap-3.5 rounded-3xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.09]"
            >
              <ChainIcon chain={chain.id} size={40} />
              <span className="flex-1 text-14 font-bold tracking-tight text-white">{chain.name}</span>
              <span className="text-12 font-medium text-zinc-500">
                {chain.nativeCurrency.symbol}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
