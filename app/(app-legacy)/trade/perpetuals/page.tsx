import { Metadata } from "next";
import { headers } from "next/headers";
import { PerpsLoader } from "@/components/perps/perps-loader";

export const metadata: Metadata = {
    title: "Perpetuals",
};

// Leveraged perps aren't offered to US users. Phantom's pattern: the page
// stays fully visible (prices, charts, positions) with a banner up top —
// only the trading actions are disabled. Cloudflare stamps the ISO country
// on every request; no header (local dev) = allowed.
const BLOCKED_COUNTRIES = new Set(["US"]);

export default async function PerpetualsPage() {
    const country = (await headers()).get("cf-ipcountry")?.toUpperCase() ?? null;
    const geoBlocked = !!country && BLOCKED_COUNTRIES.has(country);

    return (
        <div className="h-full">
            <PerpsLoader geoBlocked={geoBlocked} />
        </div>
    );
}
