import { Metadata } from "next";
import { Target02Icon } from "@hugeicons/core-free-icons";
import { TradeComingSoon } from "@/components/trade/coming-soon";

export const metadata: Metadata = {
    title: "Predictions",
};

export default function PredictionsPage() {
    return (
        <TradeComingSoon
            icon={Target02Icon}
            title="Predictions"
            description="Markets on outcomes — creators, streams, and the wider world. Coming soon."
        />
    );
}
