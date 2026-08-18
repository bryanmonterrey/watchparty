"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Moon02Icon, Sun03Icon, ComputerIcon } from "@hugeicons/core-free-icons";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

import { useAtom } from "jotai";
import { currencyAtom, languageAtom, allowAnalyticsAtom } from "../../store/wallet-settings";
import { DrawerScreen, DrawerSection, DrawerRow } from "../../components/drawer-chrome";

interface SettingsViewProps {
    onBack: () => void;
    onNavigate: (view: string) => void;
}

const LANGUAGES: Record<string, string> = {
    en: "English", es: "Español", fr: "Français", de: "Deutsch",
    zh: "中文", ja: "日本語", ko: "한국어", ru: "Русский",
};

// Segmented control for the theme. Built here rather than reaching for the
// radix ToggleGroup it replaces: that primitive ships an `outline` variant whose
// borders drew three boxes inside a card that is itself hairlined, which is the
// banded look the drawer is moving off. Three pills in a track, one fill.
const THEMES = [
    { value: "system", label: "Auto", icon: ComputerIcon },
    { value: "light", label: "Light", icon: Sun03Icon },
    { value: "dark", label: "Dark", icon: Moon02Icon },
];

function ThemeSwitch() {
    const { theme, setTheme } = useTheme();
    return (
        <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-white/[0.06] p-0.5">
            {THEMES.map((t) => (
                <button
                    key={t.value}
                    onClick={() => setTheme(t.value)}
                    aria-label={t.label}
                    aria-pressed={theme === t.value}
                    className={cn(
                        "grid size-8 cursor-pointer place-items-center rounded-full transition-colors",
                        theme === t.value
                            ? "bg-white text-black"
                            : "text-zinc-500 hover:text-white",
                    )}
                >
                    <HugeiconsIcon icon={t.icon} className="size-4" strokeWidth={2} />
                </button>
            ))}
        </div>
    );
}

export function SettingsView({ onBack, onNavigate }: SettingsViewProps) {
    const [currency] = useAtom(currencyAtom);
    const [language] = useAtom(languageAtom);
    const [allowAnalytics, setAllowAnalytics] = useAtom(allowAnalyticsAtom);

    return (
        <DrawerScreen title="Settings" onBack={onBack} bodyClassName="space-y-5 p-4 pt-1">
            <DrawerSection label="Appearance">
                <DrawerRow title="Theme" control={<ThemeSwitch />} />
                <DrawerRow
                    title="Local currency"
                    description={currency}
                    onClick={() => onNavigate("currency")}
                />
                <DrawerRow
                    title="Language"
                    description={LANGUAGES[language] || language}
                    onClick={() => onNavigate("language")}
                />
            </DrawerSection>

            <DrawerSection label="Preferences">
                <DrawerRow
                    title="Balances and activity"
                    description="What shows in your portfolio and feed"
                    onClick={() => onNavigate("balances")}
                />
                <DrawerRow
                    title="Device key"
                    description="Where this wallet signs from"
                    onClick={() => onNavigate("device-key")}
                />
                <DrawerRow
                    title="Advanced"
                    description="App data and network"
                    onClick={() => onNavigate("advanced")}
                />
            </DrawerSection>

            <DrawerSection label="Privacy">
                <DrawerRow
                    title="Allow analytics"
                    description="We use anonymized data to improve your experience with Watchparty products."
                    control={
                        <Switch checked={allowAnalytics} onCheckedChange={setAllowAnalytics} />
                    }
                />
            </DrawerSection>
        </DrawerScreen>
    );
}
