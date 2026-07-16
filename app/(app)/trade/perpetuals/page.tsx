import { Metadata } from "next";
import { PerpsLoader } from "@/components/perps/perps-loader";

export const metadata: Metadata = {
    title: "Perpetuals",
};

export default function PerpetualsPage() {
    return (
        <div className="h-full">
            <PerpsLoader />
        </div>
    );
}
