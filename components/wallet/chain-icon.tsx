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
 * How much of the disc each brand mark's box occupies.
 *
 * One shared multiplier can't work, because the marks don't share a canvas
 * convention. Some are full-bleed art — Bitcoin's orange coin and the Sui /
 * BNB / Robinhood discs fill their viewBox edge to edge, and Base is a solid
 * square filling 1280×1280. Others are bare glyphs floating in a padded box:
 * Solana's bars, Ethereum's 256×417 diamond, Polygon's hexagon. At one scale
 * the full-bleed art reads far heavier than the glyphs, and Base reads
 * heaviest of all — a solid square carries much more visual weight than any
 * circle inscribed in the same box.
 *
 * These are optical, not geometric: matched by eye so the set reads level.
 * Note the SVGs keep their default preserveAspectRatio, so for a tall mark
 * (Ethereum) the number sets its HEIGHT and the width lands well under it.
 */
const MARK_SCALE: Record<ChainId, number> = {
  solana: 0.58, // wide bars, width-fit
  ethereum: 0.68, // tall diamond — height-fit, so it renders ~0.42 wide
  bitcoin: 0.64, // full-bleed coin
  base: 0.46, // full-bleed SQUARE — the smallest number in the set, by necessity
  sui: 0.64, // full-bleed disc
  polygon: 0.58,
  bnb: 0.64, // full-bleed disc
  hyperevm: 0.66, // blob is wide and short
  robinhood: 0.64, // full-bleed disc
};

/**
 * A chain's brand mark inside a black disc.
 *
 * The disc is deliberately flat — no gradient, no border, no drop shadow — so
 * nine very different brand marks read as one set. Black rather than a tint
 * because these sit on panels of varying lightness and the marks supply all
 * the colour the chip needs.
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

  const mark = size * (MARK_SCALE[chain] ?? 0.58);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-black",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Mark style={{ width: mark, height: mark }} />
    </span>
  );
}
