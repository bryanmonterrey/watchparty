import { useAtom } from "jotai";
import { currencyAtom, type CurrencyCode } from "../../store/wallet-settings";
import { DrawerScreen, DrawerRow } from "../../components/drawer-chrome";

interface LocalCurrencyViewProps {
    onBack: () => void;
}

const CURRENCIES: { code: CurrencyCode; name: string }[] = [
    { code: "USD", name: "United States dollar" },
    { code: "EUR", name: "Euro" },
    { code: "GBP", name: "British pound" },
    { code: "JPY", name: "Japanese yen" },
    { code: "CNY", name: "Chinese yuan" },
    { code: "KRW", name: "South Korean won" },
    { code: "RUB", name: "Russian ruble" },
    { code: "INR", name: "Indian rupee" },
    { code: "BRL", name: "Brazilian real" },
];

export function LocalCurrencyView({ onBack }: LocalCurrencyViewProps) {
    const [currentCurrency, setCurrency] = useAtom(currencyAtom);

    return (
        <DrawerScreen title="Local currency" onBack={onBack} bodyClassName="space-y-1 p-4 pt-1">
            {CURRENCIES.map((currency) => (
                <DrawerRow
                    key={currency.code}
                    title={currency.code}
                    description={currency.name}
                    selected={currentCurrency === currency.code}
                    onClick={() => { setCurrency(currency.code); onBack(); }}
                />
            ))}
        </DrawerScreen>
    );
}
