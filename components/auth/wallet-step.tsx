"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { SolanaProvider } from "./solana-provider";
import { signInWithSolana } from "@/lib/chains/solana/sign-in";
import { useEvmWallets } from "@/lib/chains/evm/use-evm-wallets";
import { signInWithBase, signInWithInjectedEvm, signInWithEvmWalletConnect } from "@/lib/chains/evm/sign-in";
import { SOLANA, ETHEREUM } from "@/lib/chains/registry";
import type { ChainConfig } from "@/lib/chains/types";
import { isUserRejection } from "@/lib/is-user-rejection";
import { Squircle } from "@/components/ui/squircle";
import { WaitingStep } from "./waiting-step";
import { SolanaMarkIcon, EthDiamondIcon, BaseSquareIcon, ArrowLeftIcon } from "@/components/icons";

// Full-page wallet state. Two levels: choose chain → choose a detected wallet →
// waiting (approve signature). Lazy-loaded with its scoped Solana provider.
export default function WalletStep({
  onRegisterBack,
  onExit,
}: {
  onRegisterBack?: (fn: () => boolean) => void;
  onExit?: () => void;
}) {
  return (
    <SolanaProvider>
      <WalletFlow onRegisterBack={onRegisterBack} onExit={onExit} />
    </SolanaProvider>
  );
}

type View = "methods" | "wallets" | "waiting";

function WalletFlow({
  onRegisterBack,
  onExit,
}: {
  onRegisterBack?: (fn: () => boolean) => void;
  onExit?: () => void;
}) {
  const router = useRouter();
  const sol = useWallet();
  const evmWallets = useEvmWallets();

  const [view, setView] = useState<View>("methods");
  const [chain, setChain] = useState<ChainConfig | null>(null);
  const [waiting, setWaiting] = useState<{ name: string; icon: React.ReactNode; retry: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSolana = useRef(false);
  // Where the waiting view was entered from, so "Back" returns there. QR can be
  // launched from either "methods" (Connect Wallet) or a chain's "wallets" list.
  const returnViewRef = useRef<View>("methods");

  // Hierarchical back: waiting -> origin -> methods -> exit the wallet state.
  // Used by both the inline header arrow and the login screen's top-left arrow.
  const viewRef = useRef(view);
  viewRef.current = view;
  function returnFromWaiting() {
    pendingSolana.current = false;
    setError(null);
    setView(returnViewRef.current);
  }
  function back() {
    if (viewRef.current === "waiting") {
      returnFromWaiting();
    } else if (viewRef.current === "wallets") {
      setView("methods");
    } else {
      onExit?.();
    }
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
  const walletConnect = sol.wallets.find((w) => w.adapter.name === "WalletConnect");

  // Solana: connect the selected adapter.
  useEffect(() => {
    if (!pendingSolana.current || !sol.wallet || sol.connected || sol.connecting) return;
    const ready =
      sol.wallet.readyState === WalletReadyState.Installed ||
      sol.wallet.readyState === WalletReadyState.Loadable;
    if (ready) {
      sol.connect().catch((e) => {
        pendingSolana.current = false;
        failed(e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sol.wallet, sol.connected, sol.connecting]);

  // Solana: sign in once connected.
  useEffect(() => {
    if (!pendingSolana.current || !sol.connected || !sol.publicKey || !sol.signMessage) return;
    pendingSolana.current = false;
    signInWithSolana({ publicKey: sol.publicKey, signMessage: sol.signMessage }).then(done).catch(failed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sol.connected, sol.publicKey, sol.signMessage]);

  function done() {
    router.push("/");
    router.refresh();
  }
  function failed(e: unknown) {
    // A cancel/rejection isn't a failure — quietly return where we came from.
    if (isUserRejection(e)) {
      returnFromWaiting();
      return;
    }
    setError(e instanceof Error ? e.message : "Sign-in failed.");
  }
  function startWaiting(name: string, icon: React.ReactNode, retry: () => void) {
    returnViewRef.current = viewRef.current; // remember the origin for "Back"
    setError(null);
    setWaiting({ name, icon, retry });
    setView("waiting");
  }

  function chooseSolanaWallet(name: string, label: string, icon: React.ReactNode) {
    pendingSolana.current = true;
    startWaiting(label, waitingIcon(icon), () => chooseSolanaWallet(name, label, icon));
    sol.select(name as WalletName);
  }
  async function chooseEvmWallet(run: () => Promise<unknown>, label: string, icon: React.ReactNode) {
    startWaiting(label, waitingIcon(icon), () => chooseEvmWallet(run, label, icon));
    try {
      await run();
      done();
    } catch (e) {
      console.error("[wallet] sign-in failed:", e);
      failed(e);
    }
  }

  function openChain(c: ChainConfig) {
    setError(null);
    setChain(c);
    setView("wallets");
  }

  // Small network badge (chain icon) shown on each detected wallet, like a token's chain badge.
  const chainBadge: React.ReactNode =
    chain?.kind === "solana" ? <SolanaMarkIcon className="h-full w-full" /> : <EthDiamondIcon className="h-full w-full" />;

  // The three internal views share the same fade+slide as the top-level login states.
  let content: React.ReactNode;

  if (view === "waiting" && waiting) {
    content = (
      <WaitingStep
        name={waiting.name}
        description="Approve the signature in your wallet to continue."
        icon={waiting.icon}
        error={error}
        onContinue={waiting.retry}
        onBack={returnFromWaiting}
      />
    );
  } else if (view === "wallets" && chain) {
    content = (
      <div className="flex flex-col">
        <HeaderWithBack title={chain.name} onBack={back} />
        <div className="mt-6 flex flex-col gap-2.5">
          {chain.kind === "solana" ? (
            <>
              {detectedSolana.map((w) => (
                <Row key={w.adapter.name} name={w.adapter.name} icon={w.adapter.icon} badge={chainBadge} onClick={() => chooseSolanaWallet(w.adapter.name, w.adapter.name, w.adapter.icon)} />
              ))}
              {walletConnect && (
                <Row name="WalletConnect (QR)" icon={<QrGlyph />} onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)} />
              )}
              {detectedSolana.length === 0 && <Hint>No wallet detected. Use the QR code option below.</Hint>}
            </>
          ) : (
            <>
              {evmWallets.map((w) => (
                <Row
                  key={w.rdns}
                  name={w.name}
                  icon={w.icon}
                  badge={chainBadge}
                  onClick={() => chooseEvmWallet(() => signInWithInjectedEvm(chain.chainId!, w.provider), w.name, w.icon)}
                />
              ))}
              <Row
                name="Sign in with QR code"
                icon={<QrGlyph />}
                onClick={() => chooseEvmWallet(() => signInWithEvmWalletConnect(chain.chainId!), "WalletConnect", <QrGlyph />)}
              />
            </>
          )}
        </div>
        {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col">
        <HeaderWithBack title="Connect Wallet" onBack={back} />
        <div className="mt-6 flex flex-col gap-2.5">
          <Row name="Sign in with Ethereum" icon={<EthDiamondIcon className="h-6 w-6" />} onClick={() => openChain(ETHEREUM)} />
          <Row name="Sign in with Solana" icon={<SolanaMarkIcon className="h-5 w-5" />} onClick={() => openChain(SOLANA)} />
          <Row
            name="Sign in with Base"
            icon={<BaseSquareIcon className="h-7 w-7 rounded-md" />}
            onClick={() => chooseEvmWallet(() => signInWithBase(), "Base", <BaseSquareIcon className="h-7 w-7 rounded-md" />)}
          />
          {walletConnect && (
            <Row name="Sign in with QR code" icon={<QrGlyph />} onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)} />
          )}
        </div>
        {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}
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
  icon,
  badge,
  onClick,
}: {
  name: string;
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
        <span className="flex-1 text-lg font-medium text-white">{name}</span>
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-1 text-center text-[13px] text-zinc-500">{children}</p>;
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
