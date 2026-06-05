'use client';

import { useTray } from '@/components/providers/tray-provider';
import { SendCryptoTray } from './send-crypto-tray';
import { RequestCryptoTray } from './request-crypto-tray';

export function CryptoTrays() {
    const { isOpen, activeView, closeTray } = useTray();

    return (
        <>
            <SendCryptoTray
                open={isOpen && activeView === 'send'}
                onOpenChange={(open) => !open && closeTray()}
            />
            <RequestCryptoTray
                open={isOpen && activeView === 'request'}
                onOpenChange={(open) => !open && closeTray()}
            />
        </>
    );
}
