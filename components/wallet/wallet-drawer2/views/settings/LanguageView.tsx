import { useAtom } from "jotai";
import { languageAtom, type LanguageCode } from "../../store/wallet-settings";
import { DrawerScreen, DrawerRow } from "../../components/drawer-chrome";

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
        <DrawerScreen title="Language" onBack={onBack} bodyClassName="space-y-1 p-4 pt-1">
            {LANGUAGES.map((lang) => (
                <DrawerRow
                    key={lang.code}
                    title={lang.name}
                    selected={currentLanguage === lang.code}
                    onClick={() => { setLanguage(lang.code); onBack(); }}
                />
            ))}
        </DrawerScreen>
    );
}
