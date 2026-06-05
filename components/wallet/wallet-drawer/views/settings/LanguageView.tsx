import { ArrowLeft, Check } from "lucide-react";
import { useAtom } from "jotai";
import { languageAtom, type LanguageCode } from "../../store/wallet-settings";
import { cn } from "@/lib/utils";

interface LanguageViewProps {
    onBack: () => void;
}

const LANGUAGES: { code: LanguageCode; name: string }[] = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "zh", name: "中文" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "ru", name: "Русский" },
];

export function LanguageView({ onBack }: LanguageViewProps) {
    const [currentLanguage, setLanguage] = useAtom(languageAtom);

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Language</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4">
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    {LANGUAGES.map((lang, i) => (
                        <button
                            key={lang.code}
                            onClick={() => { setLanguage(lang.code); onBack(); }}
                            className={cn(
                                "w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors group",
                                i !== LANGUAGES.length - 1 && "border-b border-white/5"
                            )}
                        >
                            <span className="text-[17px] font-semibold text-white">{lang.name}</span>
                            {currentLanguage === lang.code && (
                                <Check className="w-5 h-5 text-lantern" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">

            </div>
        </div>
    );
}
