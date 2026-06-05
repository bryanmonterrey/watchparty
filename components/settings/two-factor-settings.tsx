"use client";

import { useState, useEffect } from "react";
import { authClient } from "@/lib/auth/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { ShieldCheck, ShieldOff, Copy, Check, KeyRound, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";

function DigitInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
    return (
        <div className="flex gap-2 justify-center">
            {Array.from({ length }).map((_, i) => (
                <input
                    key={i}
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
                            const next = e.target.parentElement?.children[i + 1] as HTMLInputElement;
                            next?.focus();
                        }
                    }}
                    onKeyDown={e => {
                        if (e.key === "Backspace" && !value[i] && i > 0) {
                            const prev = e.currentTarget.parentElement?.children[i - 1] as HTMLInputElement;
                            prev?.focus();
                        }
                    }}
                    className="w-10 h-12 text-center text-lg font-bold bg-zinc-800 border border-white/15 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-lantern/60"
                />
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
                <div className="flex items-center gap-3 p-4 rounded-xl bg-lantern/10 border border-lantern/20">
                    <ShieldCheck className="w-6 h-6 text-lantern shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-zinc-100">Two-factor authentication is active</p>
                        <p className="text-xs text-zinc-400">Your account is protected with an authenticator app.</p>
                    </div>
                </div>
                <button
                    onClick={() => setStep("disable")}
                    className="w-full py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
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
                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <p className="text-sm text-red-300">Disabling 2FA reduces your account security.</p>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Enter your 6-digit authenticator code</label>
                        <DigitInput value={code} onChange={setCode} />
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setStep("idle"); setCode(""); }} className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Cancel</button>
                    <button onClick={disable2FA} disabled={loading || code.length < 6}
                        className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-500 transition-colors disabled:opacity-50">
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
                <div className="flex items-center gap-3 p-4 rounded-xl bg-lantern/10 border border-lantern/20">
                    <ShieldCheck className="w-5 h-5 text-lantern" />
                    <p className="text-sm font-bold text-zinc-100">2FA enabled successfully!</p>
                </div>
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-zinc-300">Backup Codes</p>
                        <button onClick={copyCodes} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                            {copiedCodes ? <Check className="w-3 h-3 text-lantern" /> : <Copy className="w-3 h-3" />}
                            {copiedCodes ? "Copied" : "Copy all"}
                        </button>
                    </div>
                    <p className="text-xs text-zinc-500">Save these backup codes somewhere safe. Each can be used once if you lose your authenticator.</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {backupCodes.map((code, i) => (
                            <code key={i} className="text-xs font-mono bg-zinc-800 text-zinc-300 px-2.5 py-1.5 rounded-lg text-center">{code}</code>
                        ))}
                    </div>
                </div>
                <button onClick={() => setStep("idle")} className="w-full py-2.5 rounded-xl bg-white/10 text-sm font-semibold text-zinc-200 hover:bg-white/15 transition-colors">
                    Done
                </button>
            </div>
        );
    }

    // ── Verify step ───────────────────────────────────────────────────────────
    if (step === "verify") {
        return (
            <div className="space-y-4">
                <p className="text-sm text-zinc-400">Enter the 6-digit code from your authenticator app to confirm setup.</p>
                <DigitInput value={code} onChange={v => { setCode(v); if (v.length === 6) setTimeout(() => verifyAndEnable(), 100); }} />
                <div className="flex gap-2">
                    <button onClick={() => { setStep("setup"); setCode(""); }} className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors">Back</button>
                    <button onClick={verifyAndEnable} disabled={loading || code.length < 6}
                        className="flex-1 py-2 rounded-xl bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors disabled:opacity-50">
                        {loading ? "Verifying…" : "Verify & Enable"}
                    </button>
                </div>
            </div>
        );
    }

    // ── Setup step (QR code) ──────────────────────────────────────────────────
    if (step === "setup") {
        return (
            <div className="space-y-4">
                <p className="text-sm text-zinc-400">Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
                {qrDataUrl && (
                    <div className="flex justify-center">
                        <img src={qrDataUrl} alt="TOTP QR Code" className="w-48 h-48 rounded-xl" />
                    </div>
                )}
                {secret && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-800/60 border border-white/10">
                        <code className="flex-1 text-xs font-mono text-zinc-300 tracking-widest break-all">{secret}</code>
                        <button onClick={copySecret} className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors">
                            {copiedSecret ? <Check className="w-4 h-4 text-lantern" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                )}
                <p className="text-xs text-zinc-600 text-center">Or enter the code above manually in your app.</p>
                <button onClick={() => setStep("verify")}
                    className="w-full py-2.5 rounded-xl bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors">
                    I've scanned it →
                </button>
            </div>
        );
    }

    // ── Idle (not enabled) ────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900/60 border border-white/10">
                <ShieldOff className="w-6 h-6 text-zinc-500 shrink-0" />
                <div>
                    <p className="text-sm font-bold text-zinc-200">Two-factor authentication is off</p>
                    <p className="text-xs text-zinc-500">Add an extra layer of security to your account.</p>
                </div>
            </div>
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3 text-sm text-zinc-400">
                <p className="font-semibold text-zinc-300 text-xs uppercase tracking-wide">How it works</p>
                <ol className="space-y-1.5 list-decimal list-inside text-xs">
                    <li>Install an authenticator app (Google Authenticator, Authy, 1Password)</li>
                    <li>Scan the QR code shown on the next screen</li>
                    <li>Enter the 6-digit code to verify and enable</li>
                    <li>Save your backup codes in a safe place</li>
                </ol>
            </div>
            <button
                onClick={startSetup}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors disabled:opacity-50"
            >
                {loading ? "Setting up…" : "Enable Two-Factor Auth"}
            </button>
        </div>
    );
}
