import { Metadata } from "next";
import { TradeUpIcon } from "@hugeicons/core-free-icons";
import { TradeComingSoon } from "@/components/trade/coming-soon";

export const metadata: Metadata = {
    title: "Perpetuals",
};

export default function PerpetualsPage() {
    return (
        <TradeComingSoon
            icon={TradeUpIcon}
            title="Perpetuals"
            description="Long or short with leverage, settled in USDC. In the lab — coming soon."
        />
    );
}
