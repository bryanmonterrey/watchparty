import { ArrowLeft } from "lucide-react";
import { HistoryIcon, User3Icon, DatabaseIcon, TrashIcon } from "@/components/icons";
import { appToast } from "@/components/app-ui/app-toast";
import { useSetAtom } from "jotai";
import { currencyAtom, languageAtom, hideSmallBalancesAtom, hideUnknownTokensAtom, hideReportedActivityAtom, allowAnalyticsAtom } from "../../store/wallet-settings";

interface AppDataViewProps {
    onBack: () => void;
}

export function AppDataView({ onBack }: AppDataViewProps) {
    const setCurrency = useSetAtom(currencyAtom);
    const setLanguage = useSetAtom(languageAtom);
    const setHideSmallBalances = useSetAtom(hideSmallBalancesAtom);
    const setHideUnknownTokens = useSetAtom(hideUnknownTokensAtom);
    const setHideReportedActivity = useSetAtom(hideReportedActivityAtom);
    const setAllowAnalytics = useSetAtom(allowAnalyticsAtom);

    const handleClearHistory = () => appToast.success("Account history cleared");

    const handleClearPreferences = () => {
        setCurrency("USD");
        setLanguage("en");
        setHideSmallBalances(true);
        setHideUnknownTokens(true);
        setHideReportedActivity(true);
        setAllowAnalytics(true);
        appToast.success("Preferences reset to default");
    };

    const handleClearCache = () => appToast.success("Cache cleared");

    const handleClearAll = () => {
        handleClearPreferences();
        handleClearHistory();
        handleClearCache();
    };

    const actions = [
        {
            icon: HistoryIcon,
            label: "Clear account history",
            description: "Transaction history, token balances, recent searches, and pending notifications",
            onClick: handleClearHistory,
        },
        {
            icon: User3Icon,
            label: "Clear preferences",
            description: "Favorites, swap settings, token warnings, language, and currency",
            onClick: handleClearPreferences,
        },
        {
            icon: DatabaseIcon,
            label: "Clear cache",
            description: "Temporary data such as token prices",
            onClick: handleClearCache,
        },
    ];

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">App data</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 flex flex-col gap-3">
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    {actions.map((action, i) => (
                        <button
                            key={action.label}
                            onClick={action.onClick}
                            className={`w-full flex items-start gap-4 px-4 py-4 hover:bg-white/5 transition-colors text-left ${i !== actions.length - 1 ? "border-b border-white/5" : ""}`}
                        >
                            <action.icon className="w-5 h-5 text-zinc-400 mt-0.5 shrink-0" />
                            <div className="flex flex-col">
                                <span className="text-[17px] font-semibold text-white">{action.label}</span>
                                <span className="text-[13px] text-zinc-500 leading-snug mt-0.5">{action.description}</span>
                            </div>
                        </button>
                    ))}
                </div>

                <button
                    onClick={handleClearAll}
                    className="w-full py-4 text-lg  bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center gap-2 font-semibold text-white transition-colors"
                >
                    <TrashIcon className="w-5 h-5" />
                    Clear all data
                </button>
            </div>
        </div>
    );
}
