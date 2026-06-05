"use client";

"use client";

import { useState, useEffect } from "react";
import { ChevronRight, Eye, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "boneyard-js/react";
import RevealPhraseModal from "@/components/wallet/reveal-phrase-modal";
import ExportKeyModal from "@/components/wallet/export-key-modal";

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
                <h2 className="text-xl font-semibold mb-4">Wallet Management</h2>

                {/* Recovery Phrase */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-greyy/25 rounded-3xl border border-neutral-800/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-greyy/25 rounded-lg">
                                <Eye className="w-5 h-5 text-neutral-400" />
                            </div>
                            <div>
                                <h3 className="font-medium">Recovery Phrase</h3>
                                <p className="text-sm text-neutral-400">Reveal recovery phrase</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowRevealModal(true)}
                            variant="outline"
                            size="sm"
                        >
                            Reveal
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>

                    {/* Export Private Key */}
                    <div className="flex items-center justify-between p-4 bg-greyy/25 rounded-3xl  transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-greyy/25 rounded-lg">
                                <Download className="w-5 h-5 text-neutral-400" />
                            </div>
                            <div>
                                <h3 className="font-medium">Export Private Key</h3>
                                <p className="text-sm text-neutral-400">Export your wallet's private key</p>
                            </div>
                        </div>
                        <Button
                            onClick={() => setShowExportModal(true)}
                            variant="outline"
                            size="sm"
                        >
                            Export
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-red-500/10 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-red-400">Danger Zone</h2>
                    <div>
                        <Button variant="destructive" size="sm">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </Button>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-medium text-white">Delete Wallet</h3>
                        <p className="text-sm text-neutral-400">Permanently delete your wallet and all associated data</p>
                    </div>

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
