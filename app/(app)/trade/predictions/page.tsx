import { Metadata } from "next";
import { PredictionsView } from "@/components/predictions/predictions-view";

export const metadata: Metadata = {
    title: "predictions",
};

export default function PredictionsPage() {
    return (
        <div className="h-full">
            <PredictionsView />
        </div>
    );
}
