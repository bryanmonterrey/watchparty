"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Copy01Icon, SecurityLockIcon, Shield01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Squircle } from "@/components/ui/squircle";
import { Panel, PillButton } from "@/components/settings/ui";

function DigitInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
    return (
        <div className="flex justify-center gap-2">
            {Array.from({ length }).map((_, i) => (
                <Squircle asChild radius={12} key={i}>
                    <input
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={value[i] ?? ""}
                        onChange={e => {
                            const digits = value.split("");
                            digits[i] = e.target.value.replace(/\D/g, "");
                            const next = digits.join("").slice(0, length);
                            onChange(next);
                            // Auto-focus next
                            if (e.target.value && i < length - 1) {
                                const nextEl = e.target.parentElement?.children[i + 1] as HTMLInputElement;
                                nextEl?.focus();
                            }
                        }}
                        onKeyDown={e => {
                            if (e.key === "Backspace" && !value[i] && i > 0) {
                                const prev = e.currentTarget.parentElement?.children[i - 1] as HTMLInputElement;
                                prev?.focus();
                            }
                        }}
                        className="h-12 w-10 rounded-none bg-white/[0.06] text-center text-lg font-bold text-white outline-none transition-colors focus:bg-white/[0.12]"
                    />
                </Squircle>
            ))}
        </div>
    );
}

export function TwoFactorSettings() {
    const { data: session, refetch } = useAuthSession();
    const is2FAEnabled = (session?.user as { twoFactorEnabled?: boolean })?.twoFactorEnabled ?? false;

    // Setup state
    const [step, setStep] = useState<"idle" | "setup" | "verify" | "backup" | "disable">("idle");
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [totpUri, setTotpUri] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [copiedSecret, setCopiedSecret] = useState(false);
    const [copiedCodes, setCopiedCodes] = useState(false);

    const startSetup = async () => {
        setLoading(true);
        try {
            const res = await (authClient as any).twoFactor.getTotpUri({ password });
            if (res.error) throw new Error(res.error.message);
            const uri = res.data?.totpURI;
            setTotpUri(uri);
            // Extract secret from URI for manual entry
            const secretMatch = uri?.match(/secret=([A-Z2-7]+)/i);
            if (secretMatch) setSecret(secretMatch[1]);
            // Generate QR code
            const dataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 1, color: { dark: "#ffffff", light: "#18181b" } });
            setQrDataUrl(dataUrl);
            setStep("setup");
        } catch (e: unknown) {
            toast.error((e as Error).message ?? "Failed to start 2FA setup");
        } finally {
            setLoading(false);
        }
    };

    const verifyAndEnable = async () => {
        if (code.length < 6) return;
        setLoading(true);
        try {
            const res = await (authClient as any).twoFactor.enable({ code, password });
            if (res.error) throw new Error(res.error.message);
            const codes = res.data?.backupCodes ?? [];
            setBackupCodes(codes);
            setStep("backup");
            refetch?.();
        } catch (e: unknown) {
            toast.error((e as Error).message ?? "Invalid code");
            setCode("");
        } finally {
            setLoading(false);
        }
    };

    const disable2FA = async () => {
        if (code.length < 6) return;
        setLoading(true);
        try {
            const res = await (authClient as any).twoFactor.disable({ code, password });
            if (res.error) throw new Error(res.error.message);
            toast.success("Two-factor authentication disabled");
            setStep("idle");
            setCode("");
            setPassword("");
            refetch?.();
        } catch (e: unknown) {
            toast.error((e as Error).message ?? "Invalid code");
        } finally {
            setLoading(false);
        }
    };

    const copySecret = () => {
        if (!secret) return;
        navigator.clipboard.writeText(secret);
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
    };

    const copyCodes = () => {
        navigator.clipboard.writeText(backupCodes.join("\n"));
        setCopiedCodes(true);
        setTimeout(() => setCopiedCodes(false), 2000);
    };

    // ── Enabled state ────────────────────────────────────────────────────────
    if (is2FAEnabled && step === "idle") {
        return (
            <div className="space-y-4">
                <Panel className="flex items-center gap-3 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                    <HugeiconsIcon icon={Shield01Icon} className="size-6 shrink-0 text-white" strokeWidth={2} />
                    <div>
                        <p className="text-[14px] font-bold text-white">Two-factor authentication is active</p>
                        <p className="text-[12px] font-medium text-zinc-500">Your account is protected with an authenticator app.</p>
                    </div>
                </Panel>
                <button
                    onClick={() => setStep("disable")}
                    className="h-12 w-full cursor-pointer rounded-full bg-pastelred/10 text-[13px] font-bold text-pastelred transition-colors hover:bg-pastelred/20"
                >
                    Disable 2FA
                </button>
            </div>
        );
    }

    // ── Disable flow ─────────────────────────────────────────────────────────
    if (step === "disable") {
        return (
            <div className="space-y-4">
                <Squircle asChild radius={16} autoEffects={false}>
                    <div className="flex items-center gap-3 bg-pastelred/10 p-4">
                        <HugeiconsIcon icon={Alert02Icon} className="size-5 shrink-0 text-pastelred" strokeWidth={2} />
                        <p className="text-[13px] font-medium text-pastelred">Disabling 2FA reduces your account security.</p>
                    </div>
                </Squircle>
                <div className="space-y-1.5">
                    <label className="block text-[12px] font-medium text-zinc-500">Enter your 6-digit authenticator code</label>
                    <DigitInput value={code} onChange={setCode} />
                </div>
                <div className="flex gap-2">
                    <PillButton className="h-12 flex-1" onClick={() => { setStep("idle"); setCode(""); }}>Cancel</PillButton>
                    <button onClick={disable2FA} disabled={loading || code.length < 6}
                        className="h-12 flex-1 cursor-pointer rounded-full bg-pastelred text-[13px] font-bold text-white transition-colors hover:bg-pastelred/90 disabled:pointer-events-none disabled:opacity-50">
                        {loading ? "Disabling…" : "Disable 2FA"}
                    </button>
                </div>
            </div>
        );
    }

    // ── Backup codes ─────────────────────────────────────────────────────────
    if (step === "backup") {
        return (
            <div className="space-y-4">
                <Panel className="flex items-center gap-3 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                    <HugeiconsIcon icon={Shield01Icon} className="size-5 text-white" strokeWidth={2} />
                    <p className="text-[14px] font-bold text-white">2FA enabled successfully!</p>
                </Panel>
                <Panel className="space-y-3 p-5">
                    <div className="flex items-center justify-between">
                        <p className="text-[13px] font-semibold text-zinc-300">Backup codes</p>
                        <button onClick={copyCodes} className="flex cursor-pointer items-center gap-1 text-[12px] font-medium text-zinc-400 transition-colors hover:text-white">
                            <HugeiconsIcon icon={copiedCodes ? Tick02Icon : Copy01Icon} className={copiedCodes ? "size-3 text-white" : "size-3"} strokeWidth={2} />
                            {copiedCodes ? "Copied" : "Copy all"}
                        </button>
                    </div>
                    <p className="text-[12px] font-medium text-zinc-500">Save these backup codes somewhere safe. Each can be used once if you lose your authenticator.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {backupCodes.map((c, i) => (
                            <Squircle asChild radius={10} key={i}>
                                <code className="bg-white/[0.06] px-2.5 py-1.5 text-center text-[12px] text-zinc-300">{c}</code>
                            </Squircle>
                        ))}
                    </div>
                </Panel>
                <PillButton className="h-12 w-full" onClick={() => setStep("idle")}>
                    Done
                </PillButton>
            </div>
        );
    }

    // ── Verify step ───────────────────────────────────────────────────────────
    if (step === "verify") {
        return (
            <div className="space-y-4">
                <p className="text-[13px] font-medium text-zinc-400">Enter the 6-digit code from your authenticator app to confirm setup.</p>
                <DigitInput value={code} onChange={v => { setCode(v); if (v.length === 6) setTimeout(() => verifyAndEnable(), 100); }} />
                <div className="flex gap-2">
                    <PillButton className="h-12 flex-1" onClick={() => { setStep("setup"); setCode(""); }}>Back</PillButton>
                    <PillButton variant="primary" className="h-12 flex-1" onClick={verifyAndEnable} disabled={loading || code.length < 6}>
                        {loading ? "Verifying…" : "Verify & enable"}
                    </PillButton>
                </div>
            </div>
        );
    }

    // ── Setup step (QR code) ──────────────────────────────────────────────────
    if (step === "setup") {
        return (
            <div className="space-y-4">
                <p className="text-[13px] font-medium text-zinc-400">Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                {qrDataUrl && (
                    <div className="flex justify-center">
                        <Squircle asChild radius={20}>
                            <img src={qrDataUrl} alt="TOTP QR Code" className="size-48" />
                        </Squircle>
                    </div>
                )}
                {secret && (
                    <Panel className="flex items-center gap-2 p-3">
                        <code className="flex-1 break-all text-[12px] tracking-widest text-zinc-300">{secret}</code>
                        <button onClick={copySecret} className="shrink-0 cursor-pointer rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                            <HugeiconsIcon icon={copiedSecret ? Tick02Icon : Copy01Icon} className={copiedSecret ? "size-4 text-white" : "size-4"} strokeWidth={2} />
                        </button>
                    </Panel>
                )}
                <p className="text-center text-[12px] font-medium text-zinc-600">Or enter the code above manually in your app.</p>
                <PillButton variant="primary" className="h-12 w-full" onClick={() => setStep("verify")}>
                    I've scanned it →
                </PillButton>
            </div>
        );
    }

    // ── Idle (not enabled) ────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            <Panel className="flex items-center gap-3 p-5">
                <HugeiconsIcon icon={SecurityLockIcon} className="size-6 shrink-0 text-zinc-500" strokeWidth={2} />
                <div>
                    <p className="text-[14px] font-bold text-zinc-200">Two-factor authentication is off</p>
                    <p className="text-[12px] font-medium text-zinc-500">Add an extra layer of security to your account.</p>
                </div>
            </Panel>
            <Panel className="space-y-3 p-5">
                <p className="text-[12px] font-medium text-zinc-500">How it works</p>
                <ol className="list-inside list-decimal space-y-1.5 text-[13px] text-zinc-400">
                    <li>Install an authenticator app (Google Authenticator, Authy, 1Password)</li>
                    <li>Scan the QR code shown on the next screen</li>
                    <li>Enter the 6-digit code to verify and enable</li>
                    <li>Save your backup codes in a safe place</li>
                </ol>
            </Panel>
            <PillButton variant="primary" className="h-12 w-full" onClick={startSetup} disabled={loading}>
                {loading ? "Setting up…" : "Enable two-factor auth"}
            </PillButton>
        </div>
    );
}
