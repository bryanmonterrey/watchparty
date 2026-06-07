"use client";

import { motion } from "motion/react";
import { Squircle } from "@/components/ui/squircle";
import { HapticButton } from "@/components/ui/haptic-button";

// Full-page "waiting" login state, reused for social logins and passkey.
// Icon tile with a rotating accent arc, a "Waiting for X" title, and a retry button.
export function WaitingStep({
  name,
  description,
  icon,
  onContinue,
  onBack,
  backLabel = "Back",
  busy,
  error,
  step,
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  onContinue: () => void;
  onBack?: () => void;
  backLabel?: string;
  busy?: boolean;
  error?: string | null;
  // Optional 2-step progress (1 = connect, 2 = sign) for WalletConnect/QR flows.
  step?: { current: number; total: number };
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Icon tile with rotating accent arc */}
      <div className="relative mt-16 size-[92px] sm:mt-20">
        <motion.div
          className="absolute inset-0 rounded-[26px]"
          style={{ background: "conic-gradient(from 0deg, #00ED89, rgba(0,237,137,0) 32%)" }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        <Squircle asChild radius={22} autoEffects={false}>
          <div className="absolute inset-[3px] grid place-items-center bg-[#141414]">
            {icon}
          </div>
        </Squircle>
      </div>

      <h1 className="mt-8 text-xl font-semibold tracking-tight">Waiting for {name}</h1>
      <p className="mt-2 max-w-[300px] text-center text-[15px] leading-relaxed text-zinc-400">
        {description}
      </p>

      {step && (
        <div className="mt-4 flex items-center gap-2 text-[13px] text-zinc-400">
          <span className="flex gap-1.5">
            <span className={`size-2 rounded-full ${step.current >= 1 ? "bg-[#00ED89]" : "bg-zinc-600"}`} />
            <span className={`size-2 rounded-full ${step.current >= 2 ? "bg-[#00ED89]" : "bg-zinc-600"}`} />
          </span>
          <span>
            {step.current > 1
              ? `${step.current - 1} of ${step.total} done`
              : `Step ${step.current} of ${step.total}`}
          </span>
        </div>
      )}

      {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}

      <HapticButton
        disabled={busy}
        onClick={onContinue}
        className="mt-8 flex h-[68px] w-full items-center justify-center rounded-full bg-white text-xl font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:h-[82px] sm:text-xl"
      >
        Continue
      </HapticButton>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mt-3 flex h-[68px] w-full items-center justify-center rounded-full bg-[#6A6A6A]/35 text-xl font-semibold text-white transition-colors hover:bg-[#6A6A6A]/50 sm:h-[82px]"
        >
          {backLabel}
        </button>
      )}
    </div>
  );
}

export function FingerprintIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-white" aria-hidden="true">
      <path d="M12 11c0 3.5-.5 6-1.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M8.5 9.5A3.5 3.5 0 0 1 15.5 11c0 3-.4 5.5-1.2 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.5 11a6.5 6.5 0 0 1 13 0c0 1.2-.1 2.4-.3 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 11v1.5c0 2.8-.3 5.2-1 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.5 8.5a9 9 0 0 1 15.2-1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
