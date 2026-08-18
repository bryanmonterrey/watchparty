"use client";

import { useEffect } from "react";
import { useCluster, ClusterNetwork } from "@/components/cluster/cluster-data-access";
import { DrawerScreen, DrawerSection, DrawerRow } from "../../components/drawer-chrome";

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
        <DrawerScreen title="Advanced" onBack={onBack} bodyClassName="space-y-5 p-4 pt-1">
            <DrawerSection label="Storage">
                <DrawerRow
                    title="App data"
                    description="Clear cached history, preferences and prices"
                    onClick={() => onNavigate("app-data")}
                />
            </DrawerSection>
        </DrawerScreen>
    );
}
