import { ArrowLeft } from "lucide-react";
import { SunIcon, MoonIcon } from "@/components/icons";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "next-themes";

import { useAtom } from "jotai";
import { currencyAtom, languageAtom, allowAnalyticsAtom } from "../../store/wallet-settings";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/animate-ui/components/radix/toggle-group";

interface SettingsViewProps {
    onBack: () => void;
    onNavigate: (view: string) => void;
}

const LANGUAGES: Record<string, string> = {
    en: "English", es: "Español", fr: "Français", de: "Deutsch",
    zh: "中文", ja: "日本語", ko: "한국어", ru: "Русский",
};

export function SettingsView({ onBack, onNavigate }: SettingsViewProps) {
    const { theme, setTheme } = useTheme();
    const [currency] = useAtom(currencyAtom);
    const [language] = useAtom(languageAtom);
    const [allowAnalytics, setAllowAnalytics] = useAtom(allowAnalyticsAtom);

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Settings</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 space-y-3">
                {/* Appearance */}
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    {/* Theme */}
                    <div className="flex items-center justify-between px-4 py-4 border-b border-white/5">
                        <span className="text-[17px] font-semibold text-white">Theme</span>
                        <ToggleGroup
                            type="single"
                            value={theme}
                            onValueChange={(v) => v && setTheme(v)}
                            variant="outline"
                            size="sm"
                        >
                            <ToggleGroupItem value="system">Auto</ToggleGroupItem>
                            <ToggleGroupItem value="light"><SunIcon className="w-3.5 h-3.5" /></ToggleGroupItem>
                            <ToggleGroupItem value="dark"><MoonIcon className="w-3.5 h-3.5" /></ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    {/* Local currency */}
                    <button
                        onClick={() => onNavigate("currency")}
                        className="flex items-center cursor-pointer justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group border-b border-white/5"
                    >
                        <div className="flex flex-col items-start">
                            <span className="text-[17px] font-semibold text-white">Local currency</span>
                            <span className="text-[14px] text-zinc-500">{currency}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>

                    {/* Language */}
                    <button
                        onClick={() => onNavigate("language")}
                        className="flex items-center cursor-pointer justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group"
                    >
                        <div className="flex flex-col items-start">
                            <span className="text-[17px] font-semibold text-white">Language</span>
                            <span className="text-[14px] text-zinc-500">{LANGUAGES[language] || language}</span>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                </div>

                {/* Preferences */}
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    <button
                        onClick={() => onNavigate("balances")}
                        className="flex items-center cursor-pointer justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group border-b border-white/5"
                    >
                        <span className="text-[17px] font-semibold text-white">Balances &amp; activity</span>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                    <button
                        onClick={() => onNavigate("device-key")}
                        className="flex items-center cursor-pointer justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group border-b border-white/5"
                    >
                        <span className="text-[17px] font-semibold text-white">Device key</span>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                    <button
                        onClick={() => onNavigate("advanced")}
                        className="flex items-center cursor-pointer justify-between w-full px-4 py-4 hover:bg-white/5 transition-colors group"
                    >
                        <span className="text-[17px] font-semibold text-white">Advanced</span>
                        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" />
                    </button>
                </div>

                {/* Analytics */}
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-4">
                        <div className="flex flex-col flex-1 pr-4">
                            <span className="text-[17px] font-semibold text-white">Allow analytics</span>
                            <span className="text-[13px] text-zinc-500 leading-snug mt-0.5">
                                We use anonymized data to enhance your experience with Watchparty products.
                            </span>
                        </div>
                        <Switch checked={allowAnalytics} onCheckedChange={setAllowAnalytics} />
                    </div>
                </div>
            </div>
        </div>
    );
}
