import { ArrowLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAtom } from "jotai";
import { hideSmallBalancesAtom, hideUnknownTokensAtom, hideReportedActivityAtom } from "../../store/wallet-settings";

interface BalancesViewProps {
    onBack: () => void;
}

export function BalancesView({ onBack }: BalancesViewProps) {
    const [hideSmallBalances, setHideSmallBalances] = useAtom(hideSmallBalancesAtom);
    const [hideUnknownTokens, setHideUnknownTokens] = useAtom(hideUnknownTokensAtom);
    const [hideReportedActivity, setHideReportedActivity] = useAtom(hideReportedActivityAtom);

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Balances &amp; activity</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 space-y-3">
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                        <div className="flex flex-col flex-1 pr-4">
                            <span className="text-[17px] font-semibold text-white">Hide small balances</span>
                            <span className="text-[13px] text-zinc-500 leading-snug mt-0.5">
                                Balances under $1 will be hidden from your portfolio.
                            </span>
                        </div>
                        <Switch checked={hideSmallBalances} onCheckedChange={setHideSmallBalances} />
                    </div>
                    <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                        <div className="flex flex-col flex-1 pr-4">
                            <span className="text-[17px] font-semibold text-white">Hide unknown coins</span>
                            <span className="text-[13px] text-zinc-500 leading-snug mt-0.5">
                                Potential scam coins will be hidden from your portfolio.
                            </span>
                        </div>
                        <Switch checked={hideUnknownTokens} onCheckedChange={setHideUnknownTokens} />
                    </div>
                    <div className="flex items-center justify-between px-4 py-4">
                        <div className="flex flex-col flex-1 pr-4">
                            <span className="text-[17px] font-semibold text-white">Hide reported activity</span>
                            <span className="text-[13px] text-zinc-500 leading-snug mt-0.5">
                                Transactions reported as spam will be hidden from your activity feed.
                            </span>
                        </div>
                        <Switch checked={hideReportedActivity} onCheckedChange={setHideReportedActivity} />
                    </div>
                </div>
            </div>
        </div>
    );
}
