"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendEmailOtp, verifyEmailOtp } from "@/lib/auth/client";
import { OtpInput } from "./otp-input";

const RESEND_COOLDOWN = 60;

// A full-page state of the login screen (not a modal) — same dark layout.
export function ConfirmEmailStep({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startCooldown();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function verify(code: string) {
    if (verifying) return;
    setError(null);
    setVerifying(true);
    const { error } = await verifyEmailOtp(email, code);
    setVerifying(false);
    if (error) {
      setError(error.message ?? "Invalid or expired code.");
      setOtp("");
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function resend() {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setError(null);
    const { error } = await sendEmailOtp(email);
    setSending(false);
    if (error) {
      setError(error.message ?? "Couldn't resend the code.");
      return;
    }
    startCooldown();
  }

  return (
    <div className="flex flex-col">
      <h1 className="mt-12 text-2xl font-semibold tracking-tight sm:mt-[68px] sm:text-[28px]">
        Confirm Email
      </h1>
      <p className="mt-2 text-[15px] text-zinc-400">
        Enter the verification code sent to{" "}
        <span className="text-white">{email}</span>
      </p>

      <div className="mt-7">
        <OtpInput value={otp} onChange={setOtp} onComplete={verify} disabled={verifying} autoFocus />
      </div>

      <button
        type="button"
        disabled={otp.length !== 6 || verifying}
        onClick={() => verify(otp)}
        className="mt-7 flex h-[68px] items-center justify-center gap-2 rounded-full bg-[#00ED89] text-base font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50 sm:h-[82px] sm:text-[17px]"
      >
        {verifying ? (
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-black/40 border-t-transparent" />
        ) : (
          <CheckGlyph />
        )}
        Complete
      </button>

      {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}

      <button
        type="button"
        onClick={resend}
        disabled={cooldown > 0 || sending}
        className="mt-6 text-center text-[14px] text-zinc-500 transition-colors enabled:hover:text-white disabled:cursor-default"
      >
        {sending ? "Sending…" : cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
      </button>
    </div>
  );
}

function CheckGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
