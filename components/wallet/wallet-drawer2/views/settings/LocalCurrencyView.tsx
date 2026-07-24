import { ArrowLeft, Check } from "lucide-react";
import { useAtom } from "jotai";
import { currencyAtom, type CurrencyCode } from "../../store/wallet-settings";
import { cn } from "@/lib/utils";

interface LocalCurrencyViewProps {
    onBack: () => void;
}

const CURRENCIES: { code: CurrencyCode; name: string }[] = [
    { code: "USD", name: "United States Dollar" },
    { code: "EUR", name: "Euro" },
    { code: "GBP", name: "British Pound" },
    { code: "JPY", name: "Japanese Yen" },
    { code: "CNY", name: "Chinese Yuan" },
    { code: "KRW", name: "South Korean Won" },
    { code: "RUB", name: "Russian Ruble" },
    { code: "INR", name: "Indian Rupee" },
    { code: "BRL", name: "Brazilian Real" },
];

export function LocalCurrencyView({ onBack }: LocalCurrencyViewProps) {
    const [currentCurrency, setCurrency] = useAtom(currencyAtom);

    return (
        <div className="flex flex-col h-full bg-black text-white rounded-2xl">
            <div className="flex items-center justify-center px-4 pt-4 pb-2 relative min-h-[56px]">
                <button
                    onClick={onBack}
                    className="absolute left-3 p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white">Local currency</h2>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar p-4">
                <div className="bg-gray1 rounded-[22px] overflow-hidden">
                    {CURRENCIES.map((currency, i) => (
                        <button
                            key={currency.code}
                            onClick={() => { setCurrency(currency.code); onBack(); }}
                            className={cn(
                                "w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors group",
                                i !== CURRENCIES.length - 1 && "border-b border-white/5"
                            )}
                        >
                            <div className="flex flex-col items-start">
                                <span className="text-[17px] font-semibold text-white">{currency.code}</span>
                                <span className="text-[13px] text-zinc-500">{currency.name}</span>
                            </div>
                            {currentCurrency === currency.code && (
                                <Check className="w-5 h-5 text-lantern" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
