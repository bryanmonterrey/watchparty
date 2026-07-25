"use client";

import * as React from "react";
import {
  BaseSquareIcon,
  BitcoinIcon,
  BnbIcon,
  EthereumIcon,
  HyperliquidIcon,
  PolygonIcon,
  RobinhoodIcon,
  SolanaMarkIcon,
  SuiIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/chains/types";

const MARKS: Record<ChainId, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  solana: SolanaMarkIcon,
  ethereum: EthereumIcon,
  bitcoin: BitcoinIcon,
  base: BaseSquareIcon,
  sui: SuiIcon,
  polygon: PolygonIcon,
  bnb: BnbIcon,
  hyperevm: HyperliquidIcon,
  robinhood: RobinhoodIcon,
};

/**
 * A chain's brand mark inside a neutral disc.
 *
 * The disc is deliberately flat — no gradient, no drop shadow — so eight very
 * different brand marks read as one set. Depth comes from the inset hairline.
 */
export function ChainIcon({
  chain,
  className,
  size = 40,
}: {
  chain: ChainId;
  className?: string;
  size?: number;
}) {
  const Mark = MARKS[chain];
  if (!Mark) return null;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.06]",
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-full",
        "after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Mark style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
