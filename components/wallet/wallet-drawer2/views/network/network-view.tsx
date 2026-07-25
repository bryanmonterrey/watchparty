"use client";

import * as React from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { CHAINS } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";
import { ChainIcon } from "@/components/wallet/chain-icon";
import { cn } from "@/lib/utils";

interface NetworkViewProps {
  activeChain: ChainId;
  onSelect: (chain: ChainId) => void;
  onClose: () => void;
}

/**
 * Network switcher.
 *
 * One row per chain, all eight derived from the same phrase. The five EVM
 * chains share an address, so switching between them changes what you're
 * looking at, never who you are.
 */
export function NetworkView({ activeChain, onSelect, onClose }: NetworkViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="flex h-full flex-col"
    >
      <div className="relative flex flex-shrink-0 items-center px-5 pb-4 pt-5">
        <button
          onClick={onClose}
          aria-label="close"
          className="z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/[0.06] text-zinc-400 transition-colors hover:bg-white/[0.1] hover:text-white"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-[18px]" strokeWidth={2} />
        </button>
        <span className="pointer-events-none absolute left-0 right-0 text-center text-[18px] font-semibold text-white">
          change network
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {CHAINS.map((chain) => {
          const isActive = chain.id === activeChain;
          return (
            <button
              key={chain.id}
              onClick={() => onSelect(chain.id)}
              className={cn(
                "group flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-2.5 text-left transition-colors",
                isActive ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
              )}
            >
              <ChainIcon chain={chain.id} size={40} />
              <span className="flex-1 text-[17px] font-medium text-white">{chain.name}</span>
              {isActive && (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  className="size-5 text-white/70"
                  strokeWidth={2.5}
                />
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
