"use client";

import { useEffect } from "react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useCluster, ClusterNetwork } from "@/components/cluster/cluster-data-access";

interface AdvancedViewProps {
    onBack: () => void;
    onNavigate: (view: string) => void;
}

export function AdvancedView({ onBack, onNavigate }: AdvancedViewProps) {
    // Devnet is no longer user-selectable. Pin to mainnet (recovers anyone left
    // on a previously-selected devnet/testnet cluster).
    const { cluster, setCluster, clusters } = useCluster();
    useEffect(() => {
        if (cluster.network !== ClusterNetwork.Mainnet) {
            const mainnet = clusters.find(c => c.network === ClusterNetwork.Mainnet);
            if (mainnet) setCluster(mainnet);
        }
    }, [cluster.network, clusters, setCluster]);

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Advanced</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 space-y-3">
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    <button
                        onClick={() => onNavigate("app-data")}
                        className="flex items-center justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group"
                    >
                        <span className="text-[17px] font-semibold text-white">App data</span>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                </div>
            </div>
        </div>
    );
}
