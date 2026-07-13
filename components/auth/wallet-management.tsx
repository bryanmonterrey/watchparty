"use client";

import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Delete02Icon, Download01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import RevealPhraseModal from "@/components/wallet/reveal-phrase-modal";
import ExportKeyModal from "@/components/wallet/export-key-modal";
import { Panel } from "@/components/settings/ui";

interface WalletManagementProps {
    isLoading?: boolean;
}

export default function WalletManagement({ isLoading = false }: WalletManagementProps) {
    const [showRevealModal, setShowRevealModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [internalLoading, setInternalLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setInternalLoading(false);
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const showSkeleton = isLoading || internalLoading;

    return (
        <Skeleton name="wallet-management" loading={showSkeleton}>
        <div className="space-y-4">
            <div>
                <h2 className="mb-4 text-[16px] font-bold tracking-tight text-white">Wallet</h2>

                <div className="space-y-3">
                    {/* Recovery Phrase */}
                    <Panel className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-white/5 p-2.5">
                                <HugeiconsIcon icon={ViewIcon} className="size-5 text-zinc-400" strokeWidth={2} />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-semibold text-white">Recovery phrase</h3>
                                <p className="text-[12px] font-medium text-zinc-500">Reveal recovery phrase</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowRevealModal(true)}
                            variant="ghost"
                            size="sm"
                            className="rounded-full bg-white/5 hover:bg-white/10"
                        >
                            Reveal
                            <HugeiconsIcon icon={ArrowRight01Icon} className="ml-2 size-4" strokeWidth={2} />
                        </Button>
                    </Panel>

                    {/* Export Private Key */}
                    <Panel className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                            <div className="rounded-full bg-white/5 p-2.5">
                                <HugeiconsIcon icon={Download01Icon} className="size-5 text-zinc-400" strokeWidth={2} />
                            </div>
                            <div>
                                <h3 className="text-[14px] font-semibold text-white">Export private key</h3>
                                <p className="text-[12px] font-medium text-zinc-500">Export your wallet&apos;s private key</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowExportModal(true)}
                            variant="ghost"
                            size="sm"
                            className="rounded-full bg-white/5 hover:bg-white/10"
                        >
                            Export
                            <HugeiconsIcon icon={ArrowRight01Icon} className="ml-2 size-4" strokeWidth={2} />
                        </Button>
                    </Panel>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="rounded-[24px] bg-pastelred/10 p-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-[14px] font-bold text-pastelred">Delete wallet</h3>
                        <p className="text-[12px] font-medium text-zinc-500">Permanently delete your wallet and all associated data</p>
                    </div>
                    <button className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-pastelred px-4 text-[13px] font-bold text-white transition-colors hover:bg-pastelred/90">
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Modals */}
            <RevealPhraseModal
                isOpen={showRevealModal}
                onClose={() => setShowRevealModal(false)}
            />
            <ExportKeyModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
            />
        </div>
        </Skeleton>
    );
}
