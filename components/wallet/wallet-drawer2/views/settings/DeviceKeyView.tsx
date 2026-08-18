'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { SecurityCheckIcon, SecurityWarningIcon, ShieldBanIcon, Loading03Icon } from '@hugeicons/core-free-icons';
import { useDeviceRecovery } from '@/hooks/use-device-recovery';
import { DrawerScreen } from '../../components/drawer-chrome';

interface DeviceKeyViewProps {
    onBack: () => void;
}

// Status is the whole screen, so it gets the ceremonial treatment: one large
// glyph in a tinted disc, a 15px bold line, a 12px explanation. Colour is
// semantic only — lantern for secured, sunset for "needs your attention",
// neutral zinc for the two informational states. (Was emerald-400/yellow-400,
// raw Tailwind ramps that appear nowhere else in the app.)
const STATUS_CONFIG = {
    loading: {
        icon: Loading03Icon,
        spin: true,
        tone: 'text-zinc-400',
        disc: 'bg-white/[0.06]',
        title: 'Checking…',
        description: '',
    },
    secured: {
        icon: SecurityCheckIcon,
        spin: false,
        tone: 'text-lantern',
        disc: 'bg-lantern/15',
        title: 'This device is secured',
        description: 'Your wallet key is stored locally on this device. Transactions are signed in your browser — the server never sees your private key.',
    },
    needs_restore: {
        icon: SecurityWarningIcon,
        spin: false,
        tone: 'text-sunset',
        disc: 'bg-sunset/15',
        title: 'Wallet key not on this device',
        description: 'You have a backup secured by your passkey. Restore it now so transactions can be signed locally on this device.',
    },
    no_backup: {
        icon: ShieldBanIcon,
        spin: false,
        tone: 'text-zinc-400',
        disc: 'bg-white/[0.06]',
        title: 'No local key available',
        description: 'This wallet was created before client-side signing was supported. Transactions are signed securely on the server.',
    },
    unsupported: {
        icon: ShieldBanIcon,
        spin: false,
        tone: 'text-zinc-400',
        disc: 'bg-white/[0.06]',
        title: 'Not supported',
        description: 'Your browser or authenticator does not support the WebAuthn PRF extension required for local key storage.',
    },
};

export function DeviceKeyView({ onBack }: DeviceKeyViewProps) {
    const { status, recover, isRecovering } = useDeviceRecovery();
    const cfg = STATUS_CONFIG[status];

    return (
        <DrawerScreen
            title="Device key"
            onBack={onBack}
            scroll={false}
            bodyClassName="flex flex-col items-center justify-center gap-8 px-6 pb-10"
        >
            <div className="flex flex-col items-center gap-4 text-center">
                <div className={`grid size-16 place-items-center rounded-full ${cfg.disc}`}>
                    <HugeiconsIcon
                        icon={cfg.icon}
                        className={`size-8 ${cfg.tone} ${cfg.spin ? 'animate-spin' : ''}`}
                        strokeWidth={2}
                    />
                </div>
                <p className="text-15 font-bold tracking-tight text-white">{cfg.title}</p>
                {cfg.description && (
                    <p className="max-w-[280px] text-12 font-medium leading-relaxed text-zinc-500">
                        {cfg.description}
                    </p>
                )}
            </div>

            {status === 'needs_restore' && (
                <button
                    onClick={recover}
                    disabled={isRecovering}
                    className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-14 font-bold text-black transition-opacity hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
                >
                    {isRecovering ? (
                        <>
                            <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2.5} />
                            Verifying…
                        </>
                    ) : (
                        'Restore with passkey'
                    )}
                </button>
            )}
        </DrawerScreen>
    );
}
