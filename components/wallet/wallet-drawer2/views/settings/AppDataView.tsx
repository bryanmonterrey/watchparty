import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HistoryIcon, User3Icon, DatabaseIcon } from "@/components/icons";
import { appToast } from "@/components/app-ui/app-toast";
import { useSetAtom } from "jotai";
import { currencyAtom, languageAtom, hideSmallBalancesAtom, hideUnknownTokensAtom, hideReportedActivityAtom, allowAnalyticsAtom } from "../../store/wallet-settings";
import { DrawerScreen, DrawerSection, DrawerRow } from "../../components/drawer-chrome";

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
            description: "Transaction history, coin balances, recent searches, and pending notifications",
            onClick: handleClearHistory,
        },
        {
            icon: User3Icon,
            label: "Clear preferences",
            description: "Favorites, swap settings, coin warnings, language, and currency",
            onClick: handleClearPreferences,
        },
        {
            icon: DatabaseIcon,
            label: "Clear cache",
            description: "Temporary data such as coin prices",
            onClick: handleClearCache,
        },
    ];

    return (
        <DrawerScreen title="App data" onBack={onBack} bodyClassName="space-y-5 p-4 pt-1">
            <DrawerSection label="Clear">
                {actions.map((action) => (
                    <DrawerRow
                        key={action.label}
                        icon={<action.icon className="size-5" />}
                        title={action.label}
                        description={action.description}
                        onClick={action.onClick}
                    />
                ))}
            </DrawerSection>

            {/* Pill, so it reads as the one destructive commit on the screen and
                not as a fourth row. h-12 is the wide-button height from the
                design system — it was py-4 on an unnamed height before. */}
            <button
                onClick={handleClearAll}
                className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-pastelred/15 text-15 font-bold text-pastelred transition-colors hover:bg-pastelred/25 active:scale-[0.99]"
            >
                <HugeiconsIcon icon={Delete02Icon} className="size-5" strokeWidth={2} />
                Clear all data
            </button>
        </DrawerScreen>
    );
}
