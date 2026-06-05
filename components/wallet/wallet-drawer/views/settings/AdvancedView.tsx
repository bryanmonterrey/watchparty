import { ArrowLeft, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useCluster, ClusterNetwork } from "@/components/cluster/cluster-data-access";

interface AdvancedViewProps {
    onBack: () => void;
    onNavigate: (view: string) => void;
}

export function AdvancedView({ onBack, onNavigate }: AdvancedViewProps) {
    const { cluster, setCluster, clusters } = useCluster();
    const isTestnet = cluster.network === ClusterNetwork.Devnet || cluster.network === ClusterNetwork.Testnet;

    const handleTestnetToggle = (checked: boolean) => {
        if (checked) {
            const devnet = clusters.find(c => c.network === ClusterNetwork.Devnet);
            if (devnet) setCluster(devnet);
        } else {
            const mainnet = clusters.find(c => c.network === ClusterNetwork.Mainnet);
            if (mainnet) setCluster(mainnet);
        }
    };

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
                        className="flex items-center justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group border-b border-white/5"
                    >
                        <span className="text-[17px] font-semibold text-white">App data</span>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                    <div className="flex items-center justify-between px-4 py-4">
                        <div className="flex flex-col">
                            <span className="text-[17px] font-semibold text-white">Testnet mode</span>
                            <span className="text-[13px] text-zinc-500 mt-0.5">Use devnet for testing</span>
                        </div>
                        <Switch checked={isTestnet} onCheckedChange={handleTestnetToggle} />
                    </div>
                </div>
            </div>
        </div>
    );
}
