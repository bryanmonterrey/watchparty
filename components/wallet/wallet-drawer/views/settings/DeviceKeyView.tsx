'use client';

import { ArrowLeft, ShieldCheck, ShieldAlert, ShieldOff, Loader2 } from 'lucide-react';
import { useDeviceRecovery } from '@/hooks/use-device-recovery';
import { Button } from '@/components/ui/button';

interface DeviceKeyViewProps {
    onBack: () => void;
}

const STATUS_CONFIG = {
    loading: {
        icon: <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />,
        title: 'Checking…',
        description: '',
        color: 'text-zinc-400',
    },
    secured: {
        icon: <ShieldCheck className="w-8 h-8 text-emerald-400" />,
        title: 'This device is secured',
        description: 'Your wallet key is stored locally on this device. Transactions are signed in your browser — the server never sees your private key.',
        color: 'text-emerald-400',
    },
    needs_restore: {
        icon: <ShieldAlert className="w-8 h-8 text-yellow-400" />,
        title: 'Wallet key not on this device',
        description: 'You have a backup secured by your passkey. Restore it now so transactions can be signed locally on this device.',
        color: 'text-yellow-400',
    },
    no_backup: {
        icon: <ShieldOff className="w-8 h-8 text-zinc-500" />,
        title: 'No local key available',
        description: 'This wallet was created before client-side signing was supported. Transactions are signed securely on the server.',
        color: 'text-zinc-400',
    },
    unsupported: {
        icon: <ShieldOff className="w-8 h-8 text-zinc-500" />,
        title: 'Not supported',
        description: 'Your browser or authenticator does not support the WebAuthn PRF extension required for local key storage.',
        color: 'text-zinc-400',
    },
};

export function DeviceKeyView({ onBack }: DeviceKeyViewProps) {
    const { status, recover, isRecovering } = useDeviceRecovery();
    const cfg = STATUS_CONFIG[status];

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Device Key</h2>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 pb-8">
                <div className="flex flex-col items-center gap-3 text-center">
                    {cfg.icon}
                    <p className={`text-[17px] font-semibold ${cfg.color}`}>{cfg.title}</p>
                    {cfg.description && (
                        <p className="text-[13px] text-zinc-500 leading-relaxed max-w-[280px]">
                            {cfg.description}
                        </p>
                    )}
                </div>

                {status === 'needs_restore' && (
                    <Button
                        onClick={recover}
                        disabled={isRecovering}
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-full py-5 font-semibold"
                    >
                        {isRecovering ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Verifying…
                            </span>
                        ) : (
                            'Restore with Passkey'
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}
