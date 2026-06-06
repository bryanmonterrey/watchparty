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
import { useBitcoinWallets, signInWithBitcoin, type BtcWallet } from "@/lib/chains/bitcoin/sign-in";
import { SOLANA, ETHEREUM, BITCOIN } from "@/lib/chains/registry";
import type { ChainConfig } from "@/lib/chains/types";
import { Squircle } from "@/components/ui/squircle";
import { WaitingStep } from "./waiting-step";
import { SolanaMarkIcon, EthDiamondIcon, BaseSquareIcon, BitcoinIcon } from "@/components/icons";

// Full-page wallet state. Two levels: choose method/chain → choose a detected
// wallet → waiting (approve signature). Lazy-loaded with its scoped Solana provider.
export default function WalletStep({ onRegisterBack }: { onRegisterBack?: (fn: () => boolean) => void }) {
  return (
    <SolanaProvider>
      <WalletFlow onRegisterBack={onRegisterBack} />
    </SolanaProvider>
  );
}

type View = "methods" | "wallets" | "waiting";

function WalletFlow({ onRegisterBack }: { onRegisterBack?: (fn: () => boolean) => void }) {
  const router = useRouter();
  const sol = useWallet();
  const evmWallets = useEvmWallets();
  const bitcoinWallets = useBitcoinWallets();

  const [view, setView] = useState<View>("methods");
  const [chain, setChain] = useState<ChainConfig | null>(null);
  const [waiting, setWaiting] = useState<{ name: string; icon: React.ReactNode; retry: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSolana = useRef(false);

  // Let the login screen's shared top-left arrow drive back-navigation through
  // the wallet sub-views (waiting -> wallets -> methods -> exit).
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    onRegisterBack?.(() => {
      if (viewRef.current === "waiting") {
        pendingSolana.current = false;
        setError(null);
        setView("wallets");
        return true;
      }
      if (viewRef.current === "wallets") {
        setView("methods");
        return true;
      }
      return false; // at the top — let the login screen exit the wallet state
    });
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
        if (!String(e?.message ?? e).toLowerCase().includes("reject")) setError("Couldn't connect to that wallet.");
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
    setError(e instanceof Error ? e.message : "Sign-in failed.");
  }
  function startWaiting(name: string, icon: React.ReactNode, retry: () => void) {
    setError(null);
    setWaiting({ name, icon, retry });
    setView("waiting");
  }

  function chooseSolanaWallet(name: string, label: string, icon: React.ReactNode) {
    pendingSolana.current = true;
    startWaiting(label, icon, () => chooseSolanaWallet(name, label, icon));
    sol.select(name as WalletName);
  }
  async function chooseEvmWallet(run: () => Promise<unknown>, label: string, icon: React.ReactNode) {
    startWaiting(label, icon, () => chooseEvmWallet(run, label, icon));
    try {
      await run();
      done();
    } catch (e) {
      console.error("[wallet] sign-in failed:", e);
      failed(e);
    }
  }
  async function chooseBitcoinWallet(w: BtcWallet) {
    const icon = w.icon ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={w.icon} alt="" className="size-7" />
    ) : (
      <BitcoinIcon className="h-7 w-7" />
    );
    startWaiting(w.name, icon, () => chooseBitcoinWallet(w));
    try {
      await signInWithBitcoin(w);
      done();
    } catch (e) {
      console.error("[wallet] btc sign-in failed:", e);
      failed(e);
    }
  }

  function openChain(c: ChainConfig) {
    setError(null);
    setChain(c);
    setView("wallets");
  }

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
        onBack={() => {
          pendingSolana.current = false;
          setError(null);
          setView("wallets");
        }}
      />
    );
  } else if (view === "wallets" && chain) {
    content = (
      <div className="flex flex-col">
        <h1 className="mt-12 text-2xl font-semibold tracking-tight sm:mt-[68px] sm:text-[28px]">{chain.name}</h1>
        <div className="mt-6 flex flex-col gap-2.5">
          {chain.kind === "solana" ? (
            <>
              {detectedSolana.map((w) => (
                <Row key={w.adapter.name} name={w.adapter.name} icon={w.adapter.icon} onClick={() => chooseSolanaWallet(w.adapter.name, w.adapter.name, w.adapter.icon)} />
              ))}
              {walletConnect && (
                <Row name="WalletConnect (QR)" icon={<QrGlyph />} onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)} />
              )}
              {detectedSolana.length === 0 && <Hint>No wallet detected. Use the QR code option below.</Hint>}
            </>
          ) : chain.kind === "bitcoin" ? (
            <>
              {bitcoinWallets.map((w) => (
                <Row key={w.name} name={w.name} icon={w.icon} onClick={() => chooseBitcoinWallet(w)} />
              ))}
              {bitcoinWallets.length === 0 && <Hint>No Bitcoin wallet detected. Make sure your wallet extension is unlocked.</Hint>}
            </>
          ) : (
            <>
              {evmWallets.map((w) => (
                <Row
                  key={w.rdns}
                  name={w.name}
                  icon={w.icon}
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
        <h1 className="mt-12 text-2xl font-semibold tracking-tight sm:mt-[68px] sm:text-[28px]">Connect Wallet</h1>
        <div className="mt-6 flex flex-col gap-2.5">
          <Row name="Sign in with Ethereum" icon={<EthDiamondIcon className="h-6 w-6" />} onClick={() => openChain(ETHEREUM)} />
          <Row name="Sign in with Solana" icon={<SolanaMarkIcon className="h-5 w-5" />} onClick={() => openChain(SOLANA)} />
          <Row
            name="Sign in with Base"
            icon={<BaseSquareIcon className="h-7 w-7 rounded-md" />}
            onClick={() =>
              chooseEvmWallet(() => signInWithBase(), "Base", <BaseSquareIcon className="h-7 w-7 rounded-md" />)
            }
          />
          <Row name="Sign in with Bitcoin" icon={<BitcoinIcon className="h-7 w-7" />} onClick={() => openChain(BITCOIN)} />
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
  onClick,
}: {
  name: string;
  icon?: string | React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Squircle asChild radius={22}>
      <button
        type="button"
        onClick={onClick}
        className="flex h-[77px] w-full items-center gap-3.5 bg-[#6A6A6A]/35 px-5 text-left transition-colors hover:bg-[#6A6A6A]/50"
      >
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg">
          {typeof icon === "string" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="size-7" />
          ) : (
            icon ?? <WalletGlyph />
          )}
        </span>
        <span className="flex-1 text-[16px] font-medium text-white">{name}</span>
        <ChevronGlyph />
      </button>
    </Squircle>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-1 py-1 text-center text-[13px] text-zinc-500">{children}</p>;
}

function ChevronGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-zinc-500">
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
