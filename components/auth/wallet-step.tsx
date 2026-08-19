"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { SolanaProvider } from "./solana-provider";
import { signInWithSolana } from "@/lib/chains/solana/sign-in";
import { signInWithBase } from "@/lib/chains/evm/sign-in";
import { isUserRejection } from "@/lib/is-user-rejection";
import { POST_LOGIN_REDIRECT } from "@/lib/auth/constants";
import { Squircle } from "@/components/ui/squircle";
import { WaitingStep } from "./waiting-step";
import { ArrowLeftIcon, BaseSquareIcon, SolanaMarkIcon } from "@/components/icons";

// Full-page wallet login. One list: detected Solana wallets (Phantom, Solflare,
// Backpack…), a WalletConnect QR option, and Sign in with Base.
//
// Base is the one non-Solana method, and it earns the slot by needing no
// extension at all — Base Account is a passkey smart wallet in a popup, so it
// works for someone who has never installed a wallet. The other EVM chains
// deliberately stay out of login: they'd only surface the same injected
// extensions the Solana rows already list. Lazy-loaded with its scoped Solana
// provider, which also keeps the Base SDK out of the login bundle.
export default function WalletStep({
  onRegisterBack,
  onExit,
  redirectTo,
}: {
  onRegisterBack?: (fn: () => boolean) => void;
  onExit?: () => void;
  redirectTo?: string;
}) {
  return (
    <SolanaProvider>
      <WalletFlow onRegisterBack={onRegisterBack} onExit={onExit} redirectTo={redirectTo} />
    </SolanaProvider>
  );
}

type View = "list" | "waiting";

function WalletFlow({
  onRegisterBack,
  onExit,
  redirectTo = POST_LOGIN_REDIRECT,
}: {
  onRegisterBack?: (fn: () => boolean) => void;
  onExit?: () => void;
  redirectTo?: string;
}) {
  const sol = useWallet();

  const [view, setView] = useState<View>("list");
  const [waiting, setWaiting] = useState<{ name: string; icon: React.ReactNode; retry: () => void } | null>(null);
  // 2-step wallet progress (1 = connect, 2 = sign) shown in the waiting view.
  const [wcStep, setWcStep] = useState<{ current: number; total: number } | null>(null);
  const pendingSolana = useRef(false);
  // Each wallet attempt gets an id. Back/retry bump it so a late connect/sign
  // result from an abandoned attempt is ignored (no stuck waiting, no cancelled
  // flow yanking you to /home). wcAbort tears down the live WalletConnect session.
  const flowId = useRef(0);
  const wcAbort = useRef<null | (() => void)>(null);
  // WalletConnect is excluded from the provider's autoConnect (so its modal never
  // self-opens on mount); this arms an explicit connect() when the user taps it.
  const pendingWcConnect = useRef(false);

  // Hierarchical back: waiting -> list -> exit the wallet state. Used by both the
  // inline header arrow and the login screen's top-left arrow.
  const viewRef = useRef(view);
  viewRef.current = view;

  // Hard-cancel the in-flight wallet attempt: invalidate its callbacks, reset
  // progress, and disconnect any live WalletConnect session so a pending
  // connect/sign can't complete after the user backed out.
  function abortActiveFlow() {
    flowId.current += 1;
    pendingSolana.current = false;
    pendingWcConnect.current = false;
    setWcStep(null);
    const abort = wcAbort.current;
    wcAbort.current = null;
    abort?.();
  }
  function returnFromWaiting() {
    abortActiveFlow();
    setView("list");
  }
  function back() {
    if (viewRef.current === "waiting") returnFromWaiting();
    else onExit?.();
  }
  useEffect(() => {
    onRegisterBack?.(() => {
      back();
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRegisterBack]);

  const detectedSolana = sol.wallets.filter(
    (w) =>
      w.adapter.name !== "WalletConnect" &&
      (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable),
  );
  // WalletConnect (QR) is just another adapter — selecting it opens its modal.
  const walletConnect = sol.wallets.find((w) => w.adapter.name === "WalletConnect");

  // Sign-in: for an installed extension, selecting it is enough — the provider's
  // `autoConnect` connects it (and triggers the popup). WalletConnect is excluded
  // from autoConnect (so its modal can't self-open on mount) and is connected
  // explicitly in the effect below. Either way: once connected, sign in.
  useEffect(() => {
    if (!pendingSolana.current || !sol.connected || !sol.publicKey || !sol.signMessage) return;
    pendingSolana.current = false;
    const id = flowId.current;
    setWcStep((s) => (s ? { current: 2, total: 2 } : s)); // connected → approve signature
    const { publicKey, signMessage } = sol;
    // Small delay lets the adapter settle after connect (mirrors sidebar).
    const t = setTimeout(() => {
      signInWithSolana({ publicKey, signMessage })
        .then(() => {
          if (flowId.current === id) done();
        })
        .catch((e) => {
          if (flowId.current === id) failed(e);
        });
    }, 100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sol.connected, sol.publicKey, sol.signMessage]);

  // WalletConnect is excluded from autoConnect so its modal can't pop open by
  // itself on mount. When the user explicitly taps it, connect here — that's what
  // renders the QR modal.
  useEffect(() => {
    if (!pendingWcConnect.current) return;
    if (sol.wallet?.adapter.name !== "WalletConnect" || sol.connected || sol.connecting) return;
    pendingWcConnect.current = false;
    const id = flowId.current;
    sol.connect().catch((e) => {
      if (flowId.current === id) failed(e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sol.wallet, sol.connected, sol.connecting]);

  function done() {
    // Hard navigation, not client routing: after the mobile wallet hand-off the
    // tab/session state can be stale and router.push/refresh fails ("this page
    // couldn't load"). A full load reliably picks up the new session cookie.
    window.location.href = redirectTo;
  }
  function failed(e: unknown) {
    // Cancellation or real error alike: never surface a raw message in the UI —
    // quietly return to the list. Details go to the console.
    if (!isUserRejection(e)) console.error("[wallet] sign-in failed:", e);
    returnFromWaiting();
  }
  function startWaiting(name: string, icon: React.ReactNode, retry: () => void) {
    setWaiting({ name, icon, retry });
    setView("waiting");
  }

  function chooseSolanaWallet(name: string, label: string, icon: React.ReactNode) {
    abortActiveFlow();
    pendingSolana.current = true;
    // WalletConnect is excluded from autoConnect — arm an explicit connect for it.
    if (name === "WalletConnect") pendingWcConnect.current = true;
    // Only QR is the 2-step "connect then sign" worth a progress meter; an
    // installed extension connects instantly, so skip the meter there.
    if (name === "WalletConnect") setWcStep({ current: 1, total: 2 });
    wcAbort.current = () => {
      sol.disconnect().catch(() => {});
    };
    startWaiting(label, waitingIcon(icon), () => chooseSolanaWallet(name, label, icon));
    sol.select(name as WalletName);
  }

  // Base Account isn't an adapter — it's one popup that connects and signs, so
  // there's no pending-ref/effect dance: await it directly under the same flowId
  // guard the Solana paths use, so backing out mid-popup can't complete a
  // sign-in behind the user. Genuinely 2 steps (connect, then sign), so it gets
  // the same progress meter as QR.
  async function chooseBase() {
    abortActiveFlow();
    const id = flowId.current;
    setWcStep({ current: 1, total: 2 });
    startWaiting("Base", <BaseSquareIcon className="size-9 rounded-lg" />, () => {
      void chooseBase();
    });
    try {
      await signInWithBase({
        onConnected: () => {
          if (flowId.current === id) setWcStep({ current: 2, total: 2 });
        },
      });
      if (flowId.current === id) done();
    } catch (e) {
      if (flowId.current === id) failed(e);
    }
  }

  let content: React.ReactNode;

  if (view === "waiting" && waiting) {
    content = (
      <WaitingStep
        name={waiting.name}
        description={
          wcStep?.current === 1
            ? "Connect your wallet to continue."
            : "Approve the signature in your wallet to continue."
        }
        icon={waiting.icon}
        step={wcStep ?? undefined}
        onContinue={waiting.retry}
        onBack={returnFromWaiting}
      />
    );
  } else {
    content = (
      <div className="flex flex-col">
        <HeaderWithBack title="Connect Wallet" onBack={back} />
        <p className="mt-2 text-[15px] leading-relaxed text-white/45">Choose a wallet to sign in.</p>
        <div className="mt-6 flex flex-col gap-2.5">
          {detectedSolana.map((w) => (
            <Row
              key={w.adapter.name}
              name={w.adapter.name}
              icon={w.adapter.icon}
              badge={<SolanaMarkIcon className="h-full w-full" />}
              onClick={() => chooseSolanaWallet(w.adapter.name, w.adapter.name, w.adapter.icon)}
            />
          ))}
          {walletConnect && (
            <Row
              name="Sign in with QR code"
              subtitle="Phantom, Solflare, Backpack & more"
              icon={<QrGlyph />}
              onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)}
            />
          )}
          <Row
            name="Sign in with Base"
            subtitle="No extension needed"
            icon={<BaseSquareIcon className="size-7 rounded-md" />}
            onClick={() => {
              void chooseBase();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

function Row({
  name,
  subtitle,
  icon,
  badge,
  onClick,
}: {
  name: string;
  subtitle?: string;
  icon?: string | React.ReactNode;
  badge?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Squircle asChild radius={22}>
      <button
        type="button"
        onClick={onClick}
        className="flex h-[77px] items-center w-full gap-3.5 bg-[#6A6A6A]/35 px-5 text-left transition-colors hover:bg-[#6A6A6A]/50"
      >
        <span className="relative grid size-9 shrink-0 place-items-center">
          <span className="grid size-9 place-items-center overflow-hidden rounded-lg">
            {typeof icon === "string" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="size-7" />
            ) : (
              icon ?? <WalletGlyph />
            )}
          </span>
          {badge && (
            <span className="absolute -bottom-1 -right-1.5 grid size-[15px] place-items-center overflow-hidden rounded-[5px] bg-[#1b1b1b] p-[1.5px] ring-[2.5px] ring-[#2b2b2b]">
              {badge}
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-medium leading-tight text-white">{name}</span>
          {subtitle && <span className="mt-0.5 truncate text-[13px] leading-tight text-white/45">{subtitle}</span>}
        </span>
        <ChevronGlyph />
      </button>
    </Squircle>
  );
}

// The waiting tile renders a ReactNode, but wallet icons arrive as URL strings —
// wrap those in an <img> so the chosen wallet's logo shows while signing.
function waitingIcon(icon?: string | React.ReactNode): React.ReactNode {
  if (typeof icon === "string") {
    return icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" className="size-10 rounded-xl" />
    ) : (
      <WalletGlyph />
    );
  }
  return icon ?? <WalletGlyph />;
}

function HeaderWithBack({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mt-7 flex items-center gap-2">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="-ml-2 grid size-9 place-items-center rounded-full text-white/90 transition-colors hover:bg-white/5"
      >
        <ArrowLeftIcon className="size-6" />
      </button>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
    </div>
  );
}

function ChevronGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-zinc-500">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function QrGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-white">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M14 14h3v3M21 14v7h-7v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function WalletGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-zinc-400">
      <path d="M3 8a3 3 0 0 1 3-3h12a2 2 0 0 1 2 2v1H6a1 1 0 0 0 0 2h14a2 2 0 0 1 2 2v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8Z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="13.5" r="1.5" fill="currentColor" />
    </svg>
  );
}
