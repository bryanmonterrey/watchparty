"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Search, Globe, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeToken } from "./types";
import { SolanaIcon } from "../icons";

function formatMarketCap(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatTxCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function progressColor(progress: number, status: TradeToken["status"]): string {
  if (status === "migrated") return "#00ED89";
  if (progress >= 80) return "#f97316"; // orange near migration
  if (progress >= 60) return "#eab308"; // yellow mid-way
  return "#00ED89";
}

function PlatformBadge({ platform }: { platform: TradeToken["platform"] }) {
  const colors: Record<TradeToken["platform"], string> = {
    pumpfun: "bg-[#FC353E]",
    raydium: "bg-[#8B5CF6]",
    meteora: "bg-[#00ED89]",
    other: "bg-zinc-600",
  };
  return (
    <div
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-[#0A0B0D] flex items-center justify-center",
        colors[platform]
      )}
    />
  );
}

function TokenImage({ token }: { token: TradeToken }) {
  const seed = token.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const bgColors = ["bg-zinc-700", "bg-zinc-800", "bg-zinc-600", "bg-zinc-900", "bg-zinc-750"];
  const bgColor = bgColors[seed % bgColors.length];
  const initials = token.symbol.slice(0, 2).toUpperCase();
  const barColor = progressColor(token.bondingProgress, token.status);

  const size = 56;
  const strokeWidth = 2.5;
  const radius = 14;

  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      {/* SVG Progress Border */}
      <svg className="absolute inset-0 size-full pointer-events-none -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={size - strokeWidth}
          height={size - strokeWidth}
          rx={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Progress fill */}
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={size - strokeWidth}
          height={size - strokeWidth}
          rx={radius}
          fill="none"
          stroke={barColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - token.bondingProgress}
          className="transition-all duration-500 ease-in-out"
        />
      </svg>
      
      {/* Inner Image */}
      <div 
        className={cn("overflow-hidden flex items-center justify-center text-sm font-bold text-zinc-300", bgColor)}
        style={{ 
            width: size - strokeWidth * 2 - 4, 
            height: size - strokeWidth * 2 - 4, 
            borderRadius: radius - strokeWidth 
        }}
      >
        {token.imageUrl ? (
          <img src={token.imageUrl} alt={token.symbol} className="w-full h-full object-cover" />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    </div>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.737-8.835L1.254 2.25H8.08l4.254 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

interface TokenRowProps {
  token: TradeToken;
}

export function TokenRow({ token }: TokenRowProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  // Token page resolves by tokenAddress (live) or id — either works via /[slug].
  const slug = token.tokenAddress || token.id;
  const goToToken = () => router.push(`/${slug}`);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(token.tokenAddress || token.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleBuy = (e: React.MouseEvent) => {
    e.stopPropagation(); // keep the buy click off the row → token-page navigation
    // TODO: quick-buy execution (Meteora DBC swap for bonding tokens, Jupiter once migrated)
  };

  const barColor = progressColor(token.bondingProgress, token.status);

  return (
    <div
      onClick={goToToken}
      className="group grid grid-cols-[56px_1fr_auto] gap-3 px-3 py-3 bg-black2 hover:bg-white/[0.03] cursor-pointer transition-colors duration-100 last:border-b-0"
    >

      {/* Col 1: Avatar */}
      <div className="flex items-center justify-center">
        <TokenImage token={token} />
      </div>

      {/* Col 2: Name + info rows */}
      <div className="min-w-0 flex flex-col justify-between py-0.5">
        {/* Row 1: Symbol, name, copy */}
        <div className="flex items-center gap-1.5 min-w-0 mb-1">
          <span className="font-bold text-white text-[14px] leading-none truncate tracking-wide">
            {token.symbol.startsWith('$') ? token.symbol : `$${token.symbol}`}
          </span>
          <span className="font-medium text-zinc-500 text-[12px] leading-none truncate">
            {token.name}
          </span>
          <button onClick={handleCopy} className="shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        {/* Row 2: Age, socials, holders, TX, progress */}
        <div className="flex items-center gap-2 min-w-0 mb-[3px]">
          <span className="text-zinc-400 text-[11px] shrink-0">{token.timeAgo}</span>
          <button className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0">
            <Search size={12} strokeWidth={2.5} />
          </button>
          {token.hasSocials.twitter ? (
            <button className="text-zinc-600 hover:text-[#1DA1F2] transition-colors shrink-0">
              <XIcon className="size-[11px]" />
            </button>
          ) : (
            <span className="size-[12px] shrink-0" />
          )}
          {token.hasSocials.website ? (
            <button className="text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
              <Globe size={12} strokeWidth={2.5} />
            </button>
          ) : (
            <span className="size-[12px] shrink-0" />
          )}
          <div className="flex items-center gap-1 text-zinc-500 shrink-0">
            <Users size={12} strokeWidth={2.5} />
            <span className="text-[11px] font-medium">{token.holderCount}</span>
          </div>
          <span className="text-zinc-500 text-[11px] shrink-0">
            TX <span className="text-zinc-300 font-medium">{formatTxCount(token.txCount)}</span>
          </span>
          <div className="w-8 shrink-0 h-[2.5px] bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${token.bondingProgress}%`, backgroundColor: barColor }}
            />
          </div>
        </div>

        {/* Row 3: Buy/sell percentages */}
        <div className="flex items-center gap-2.5 space-y-1">
          <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-500">
            <span className="inline-block size-2.5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <span className="block size-1 bg-[#15161C] rounded-full" />
            </span>
            {token.buyPercent}%
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-500">
            <span className="inline-block size-2.5 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
              <span className="block size-1 bg-[#15161C] rounded-full" />
            </span>
            {token.changePercent}%
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#00EFA5]">
            <span className="inline-block size-2.5 rounded-full bg-[#00EFA5] flex items-center justify-center shrink-0">
              <span className="block size-1.5 bg-[#15161C] rounded-sm transform rotate-45" />
            </span>
            {token.sellPercent}%
          </span>
        </div>
      </div>

      {/* Col 3: Buy button, market cap, volume — stacked right-aligned */}
      <div className="flex flex-col items-end justify-between space-y-1">
        <button
          onClick={handleBuy}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/40 text-emerald-500 rounded-full transition-colors"
        >
          <SolanaIcon className="size-4" />
          <span className="text-[14px] font-bold leading-tight">Buy</span>
        </button>
        <div className="text-[11px] text-zinc-500 flex items-center gap-1">
          MC <span className="text-white font-medium tracking-tight">{formatMarketCap(token.marketCap)}</span>
        </div>
        <div className="text-[11px] text-zinc-500 flex items-center gap-1">
          {token.volume > 0
            ? <><span>VOL</span><span className="text-zinc-300 font-medium tracking-tight ml-1">{formatVolume(token.volume)}</span></>
            : <span className="text-zinc-700">—</span>
          }
        </div>
      </div>

    </div>
  );
}
