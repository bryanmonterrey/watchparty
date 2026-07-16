import { Metadata } from "next";
import { headers } from "next/headers";
import { TradeUpIcon } from "@hugeicons/core-free-icons";
import { TradeComingSoon } from "@/components/trade/coming-soon";
import { PerpsLoader } from "@/components/perps/perps-loader";

export const metadata: Metadata = {
    title: "Perpetuals",
};

// Leveraged perps aren't offered to US users (the same line Drift itself
// draws — their whole frontend is US-geoblocked). Cloudflare stamps the
// ISO country on every request; no header (local dev) = allowed.
const BLOCKED_COUNTRIES = new Set(["US"]);

export default async function PerpetualsPage() {
    const country = (await headers()).get("cf-ipcountry")?.toUpperCase() ?? null;
    if (country && BLOCKED_COUNTRIES.has(country)) {
        return (
            <TradeComingSoon
                icon={TradeUpIcon}
                title="Not available in your region"
                description="Leveraged perpetuals aren't offered where you're connecting from. Everything else on watchparty works normally."
            />
        );
    }

    return (
        <div className="h-full">
            <PerpsLoader />
        </div>
    );
}
