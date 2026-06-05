"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Star2Icon } from "@/components/icons";
import {
  GoogleIcon,
  XIcon,
  TwitchIcon,
  KickIcon,
  DiscordIcon,
} from "./provider-icons";

const PROVIDERS = [
  { id: "google", label: "Continue with Google", Icon: GoogleIcon, w: 26, h: 26 },
  { id: "x", label: "Continue with X", Icon: XIcon, w: 24, h: 25 },
  { id: "twitch", label: "Continue with Twitch", Icon: TwitchIcon, w: 26, h: 26 },
  { id: "kick", label: "Continue with Kick", Icon: KickIcon, w: 23, h: 23 },
  { id: "discord", label: "Continue with Discord", Icon: DiscordIcon, w: 33, h: 26 },
] as const;

const tap = { scale: 0.97 };

export function LoginCard() {
  const [email, setEmail] = useState("");
  const canSend = /\S+@\S+\.\S+/.test(email);

  function handleProvider(id: string) {
    // TODO: wire OAuth (lazy-loaded per provider)
    console.log("oauth:", id);
  }
  function handleSendCode() {
    // TODO: wire email OTP "send code"
    console.log("send code:", email);
  }
  function handleConnectWallet() {
    // TODO: lazy-import chain SDK (Solana + EVM) and open wallet picker
    console.log("connect wallet");
  }
  function handlePasskey() {
    // TODO: wire passkey / WebAuthn sign-in
    console.log("passkey");
  }

  return (
    <div className="relative flex flex-1 flex-col items-center px-6">
      {/* Back */}
      <button
        type="button"
        aria-label="Go back"
        className="absolute left-6 top-10 grid h-10 w-10 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/5 sm:left-11"
      >
        <BackArrowIcon />
      </button>

      <div className="flex w-full max-w-[442px] flex-col pt-14 sm:pt-[72px]">
        {/* Logo tile */}
        <div className="mx-auto grid size-14 place-items-center rounded-[16px] bg-[#00ED89] sm:size-[62px] sm:rounded-[18px]">
          <Star2Icon fill="#000000" className="size-7 sm:size-[30px]" />
        </div>

        {/* Heading */}
        <h1 className="mt-12 text-2xl font-semibold tracking-tight sm:mt-[68px] sm:text-[28px]">
          Login
        </h1>

        {/* OAuth providers */}
        <div className="mt-5 flex gap-2.5 sm:gap-[17px]">
          {PROVIDERS.map(({ id, label, Icon, w, h }) => (
            <motion.button
              key={id}
              type="button"
              aria-label={label}
              whileTap={tap}
              onClick={() => handleProvider(id)}
              className="grid h-14 flex-1 place-items-center rounded-2xl bg-[#6A6A6A]/35 transition-colors hover:bg-[#6A6A6A]/50 sm:h-[61px] sm:rounded-[20px]"
            >
              <Icon width={w} height={h} />
            </motion.button>
          ))}
        </div>

        {/* Email + send code (OTP) */}
        <div className="mt-6 flex h-[68px] items-center gap-3 rounded-[24px] bg-[#6A6A6A]/35 pl-5 pr-4 sm:mt-7 sm:h-[82px] sm:rounded-[28px] sm:pl-6 sm:pr-5">
          <MailIcon className="shrink-0 text-white/85" />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-white placeholder:text-zinc-500 focus:outline-none sm:text-[17px]"
          />
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSendCode}
            className="shrink-0 text-sm text-zinc-500 transition-colors enabled:hover:text-white disabled:cursor-default sm:text-[15px]"
          >
            send code
          </button>
        </div>

        {/* Divider */}
        <div className="my-6 text-center text-[15px] font-bold tracking-wide sm:my-7">
          OR
        </div>

        {/* Connect Wallet */}
        <motion.button
          type="button"
          whileTap={tap}
          onClick={handleConnectWallet}
          className="flex h-[68px] items-center justify-center rounded-full bg-white text-base font-semibold text-black transition-colors hover:bg-white/90 sm:h-[82px] sm:text-[17px]"
        >
          Connect Wallet
        </motion.button>

        {/* Passkey */}
        <button
          type="button"
          onClick={handlePasskey}
          className="mt-6 text-center text-[15px] font-semibold text-[#1D9BF0] transition-opacity hover:opacity-80"
        >
          Sign in with Passkey
        </button>

        {/* Legal */}
        <div className="mt-7 space-y-4 text-center text-[11px] leading-relaxed text-zinc-500">
          <p>
            By entering and clicking Continue, you agree to the{" "}
            <a href="#" className="text-zinc-400 underline underline-offset-2">Terms</a>,{" "}
            <a href="#" className="text-zinc-400 underline underline-offset-2">E-Sign Consent</a>, &{" "}
            <a href="#" className="text-zinc-400 underline underline-offset-2">Privacy Policy</a>.
          </p>
          <p>
            By entering and clicking Continue, you also agree to receive a one time
            password confirmation code and informational texts from Watchparty.
            Message frequency varies. Message and data rates may apply. Reply HELP
            for help, STOP to cancel.
          </p>
        </div>
      </div>

      {/* Wordmark */}
      <div className="mt-auto py-9 text-lg font-bold tracking-tight">watchparty</div>
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 12H5M5 12L11 6M5 12L11 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 7.5L10.7 12a2.4 2.4 0 0 0 2.6 0L20 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
