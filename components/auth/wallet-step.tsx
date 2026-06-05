"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { SolanaProvider } from "./solana-provider";
import { signInWithSolana } from "@/lib/chains/solana/sign-in";
import { useEvmWallets } from "@/lib/chains/evm/use-evm-wallets";
import { signInWithBase, signInWithInjectedEvm } from "@/lib/chains/evm/sign-in";
import { SOLANA, ETHEREUM } from "@/lib/chains/registry";
import type { ChainConfig } from "@/lib/chains/types";
import { Squircle } from "@/components/ui/squircle";
import { WaitingStep } from "./waiting-step";
import { SolanaMarkIcon, EthDiamondIcon, BaseSquareIcon } from "@/components/icons";

// Full-page wallet state. Two levels: choose method/chain → choose a detected
// wallet → waiting (approve signature). Lazy-loaded with its scoped Solana provider.
export default function WalletStep() {
  return (
    <SolanaProvider>
      <WalletFlow />
    </SolanaProvider>
  );
}

type View = "methods" | "wallets" | "waiting";

function WalletFlow() {
  const router = useRouter();
  const sol = useWallet();
  const evmWallets = useEvmWallets();

  const [view, setView] = useState<View>("methods");
  const [chain, setChain] = useState<ChainConfig | null>(null);
  const [waiting, setWaiting] = useState<{ name: string; icon: React.ReactNode; retry: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingSolana = useRef(false);

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

  function openChain(c: ChainConfig) {
    setError(null);
    setChain(c);
    setView("wallets");
  }

  // ---------- waiting ----------
  if (view === "waiting" && waiting) {
    return (
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
  }

  // ---------- wallets (detected for the chosen chain) ----------
  if (view === "wallets" && chain) {
    return (
      <div className="flex flex-col">
        <SubHeader title={chain.name} onBack={() => setView("methods")} />
        <div className="mt-6 flex flex-col gap-2.5">
          {chain.kind === "solana" ? (
            <>
              {detectedSolana.map((w) => (
                <Row key={w.adapter.name} name={w.adapter.name} icon={w.adapter.icon} onClick={() => chooseSolanaWallet(w.adapter.name, w.adapter.name, w.adapter.icon)} />
              ))}
              {walletConnect && (
                <Row name="WalletConnect (QR)" icon={<QrGlyph />} onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)} />
              )}
              {detectedSolana.length === 0 && <Hint>Install a Solana wallet like Phantom, or use WalletConnect.</Hint>}
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
              {evmWallets.length === 0 && chain.id !== "base" && <Hint>No EVM wallet detected. Install MetaMask to continue.</Hint>}
            </>
          )}
        </div>
        {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}
      </div>
    );
  }

  // ---------- methods (5 options) ----------
  return (
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
        {walletConnect && (
          <Row name="Sign in with QR code" icon={<QrGlyph />} onClick={() => chooseSolanaWallet(walletConnect.adapter.name, "WalletConnect", <QrGlyph />)} />
        )}
      </div>
      {error && <p className="mt-4 text-center text-[13px] text-red-400">{error}</p>}
    </div>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mt-12 flex items-center gap-3 sm:mt-[68px]">
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/15"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
    </div>
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
        className="flex h-[68px] items-center gap-3.5 bg-[#6A6A6A]/35 px-5 text-left transition-colors hover:bg-[#6A6A6A]/50"
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
function EthGlyph() {
  return (
    <span className="grid size-7 place-items-center rounded-md bg-[#627EEA]">
      <svg width="12" height="18" viewBox="0 0 24 38" fill="none"><path d="M12 0L11.7 1v26l.3.3 11.7-6.9z" fill="#fff" fillOpacity=".8" /><path d="M12 0L.3 20.4 12 27.3V0z" fill="#fff" /><path d="M12 29.5l-.15.2v9.2l.15.4 11.7-16.5z" fill="#fff" fillOpacity=".8" /><path d="M12 38.5v-9.8L.3 22.7z" fill="#fff" /></svg>
    </span>
  );
}
function BaseGlyph() {
  return (
    <span className="grid size-7 place-items-center rounded-md bg-[#0052FF]">
      <span className="block size-2.5 rounded-full bg-white" />
    </span>
  );
}
function HyperliquidGlyph() {
  return <span className="grid size-7 place-items-center rounded-md bg-[#072723] text-[11px] font-bold text-[#97FCE4]">H</span>;
}
