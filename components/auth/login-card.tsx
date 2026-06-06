"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { Star2Icon } from "@/components/icons";
import { authClient, sendEmailOtp } from "@/lib/auth/client";
import { isUserRejection } from "@/lib/is-user-rejection";
import { ConfirmEmailStep } from "./confirm-email-step";
import { WaitingStep, FingerprintIcon } from "./waiting-step";
import { Squircle } from "@/components/ui/squircle";
import {
  GoogleIcon,
  XIcon,
  TwitchIcon,
  KickIcon,
  DiscordIcon,
} from "./provider-icons";
import { MessagesIcon, CloseIcon } from "@/components/icons";

// Wallet state pulls in the Solana SDK — load it only when navigated to.
const WalletStep = dynamic(() => import("./wallet-step"), { ssr: false });

// `provider` is the better-auth social id (X signs in via "twitter").
const PROVIDERS = [
  { id: "google", provider: "google", label: "Continue with Google", Icon: GoogleIcon, w: 26, h: 26 },
  { id: "x", provider: "twitter", label: "Continue with X", Icon: XIcon, w: 24, h: 25 },
  { id: "twitch", provider: "twitch", label: "Continue with Twitch", Icon: TwitchIcon, w: 26, h: 26 },
  { id: "kick", provider: "kick", label: "Continue with Kick", Icon: KickIcon, w: 23, h: 23 },
  { id: "discord", provider: "discord", label: "Continue with Discord", Icon: DiscordIcon, w: 33, h: 26 },
] as const;

const REDIRECT_TO = "/";
const tap = { scale: 0.97 };
const transition = { duration: 0.18 };

type Step = "methods" | "confirm" | "wallet" | "waiting";

interface Waiting {
  name: string;
  description: string;
  icon: React.ReactNode;
  retry: () => void;
}

export function LoginCard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("methods");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [waitError, setWaitError] = useState<string | null>(null);

  const canSend = /\S+@\S+\.\S+/.test(email);

  // The top-left arrow always exits the login flow to home. In-flow back
  // navigation is handled by the inline arrows inside each state.
  function handleBack() {
    router.push("/");
  }

  async function sendCode() {
    if (!canSend || sending) return;
    setError(null);
    setSending(true);
    const { error } = await sendEmailOtp(email);
    setSending(false);
    if (error) {
      setError(error.message ?? "Couldn't send the code. Try again.");
      return;
    }
    setStep("confirm");
  }

  async function signInWithProvider(provider: string, id: string) {
    const meta = PROVIDERS.find((p) => p.id === id)!;
    setWaitError(null);
    setWaiting({
      name: meta.label.replace("Continue with ", ""),
      description: `Redirecting you to ${meta.label.replace("Continue with ", "")} to finish signing in.`,
      icon: <meta.Icon width={40} height={40} />,
      retry: () => signInWithProvider(provider, id),
    });
    setStep("waiting");
    const { error } = await authClient.signIn.social({
      provider: provider as Parameters<typeof authClient.signIn.social>[0]["provider"],
      callbackURL: REDIRECT_TO,
    });
    if (error) setWaitError(error.message ?? "Sign in failed.");
    // On success the browser is redirected to the provider.
  }

  async function signInWithPasskey() {
    setWaitError(null);
    setWaiting({
      name: "Passkey",
      description: "Please follow the prompts to verify your passkey.",
      icon: <FingerprintIcon />,
      retry: signInWithPasskey,
    });
    setStep("waiting");
    try {
      const res = await authClient.signIn.passkey();
      if (res?.error) {
        // Dismissing the passkey prompt isn't a failure — quietly go back.
        if (isUserRejection(res.error)) {
          setStep("methods");
          return;
        }
        setWaitError(res.error.message ?? "Passkey sign in failed.");
        return;
      }
      router.push(REDIRECT_TO);
      router.refresh();
    } catch (e) {
      if (isUserRejection(e)) {
        setStep("methods");
        return;
      }
      setWaitError(e instanceof Error ? e.message : "Passkey sign in failed.");
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center px-6">
      <button
        type="button"
        aria-label="Close"
        onClick={handleBack}
        className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/5 sm:left-7"
      >
        <CloseIcon className="size-7" />
      </button>

      <div className="flex w-full max-w-[442px] flex-col pt-14 sm:pt-[72px]">
        {/* Logo tile — shared across states */}
        <div className="mx-auto grid place-items-center rounded-[40px] sm:size-[62px] sm:rounded-[40px]">
          <Star2Icon className="size-7 sm:size-[30px]" />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === "methods" && (
            <motion.div key="methods" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={transition} className="flex flex-col">
              <h1 className="mt-7 text-2xl font-semibold tracking-tight sm:mt-7 sm:text-[28px]">Login</h1>

              {/* OAuth providers */}
              <div className="mt-5 flex gap-2.5 sm:gap-[17px]">
                {PROVIDERS.map(({ id, provider, label, Icon, w, h }) => (
                  <Squircle key={id} asChild radius={20} autoEffects={false}>
                    <motion.button
                      type="button"
                      aria-label={label}
                      whileTap={tap}
                      disabled={!!busy}
                      onClick={() => signInWithProvider(provider, id)}
                      className="grid h-14 flex-1 place-items-center bg-[#6A6A6A]/35 transition-colors hover:bg-[#6A6A6A]/50 disabled:opacity-50 sm:h-[61px]"
                    >
                      {busy === id ? <Spinner /> : <Icon width={w} height={h} />}
                    </motion.button>
                  </Squircle>
                ))}
              </div>

              {/* Email → send code (OTP) */}
              <Squircle asChild radius={28} autoEffects={false}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendCode();
                }}
                className="mt-6 flex h-[68px] items-center gap-3 bg-[#6A6A6A]/35 pl-5 pr-4 sm:mt-7 sm:h-[82px] sm:pl-6 sm:pr-5"
              >
                <MessagesIcon className="shrink-0 size-7 text-white/85" />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base text-white caret-white placeholder:text-zinc-500 focus:outline-none sm:text-[17px]"
                />
                <button
                  type="submit"
                  disabled={!canSend || sending}
                  className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors enabled:text-[#207AFF] enabled:hover:opacity-80 disabled:cursor-default sm:text-[15px]"
                >
                  {sending ? <Spinner /> : null}
                  send code
                </button>
              </form>
              </Squircle>

              <div className="my-6 text-center text-[15px] font-bold tracking-wide sm:my-7">OR</div>

              {/* Connect Wallet → wallet state */}
              <motion.button
                type="button"
                whileTap={tap}
                onClick={() => setStep("wallet")}
                className="flex h-[68px] tracking-tight items-center justify-center rounded-full bg-white text-lg font-semibold text-black transition-colors hover:bg-white/90 sm:h-[82px] sm:text-xl"
              >
                Connect Wallet
              </motion.button>

              <button
                type="button"
                disabled={!!busy}
                onClick={signInWithPasskey}
                className="mt-6 text-center tracking-tight text-[15px] font-semibold text-[#1D9BF0] transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {busy === "passkey" ? "Authenticating…" : "Sign in with Passkey"}
              </button>

              {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}

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
            </motion.div>
          )}

          {step === "confirm" && (
            <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={transition}>
              <ConfirmEmailStep email={email} />
            </motion.div>
          )}

          {step === "wallet" && (
            <motion.div key="wallet" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={transition}>
              <WalletStep onExit={() => setStep("methods")} />
            </motion.div>
          )}

          {step === "waiting" && waiting && (
            <motion.div key="waiting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={transition}>
              <WaitingStep
                name={waiting.name}
                description={waiting.description}
                icon={waiting.icon}
                error={waitError}
                onContinue={waiting.retry}
                onBack={() => {
                  setWaitError(null);
                  setBusy(null);
                  setStep("methods");
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Wordmark — shared across states */}
      <div className="mt-auto py-9 text-lg font-bold tracking-tight">watchparty</div>
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M5 12L11 6M5 12L11 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" aria-hidden="true" />;
}
