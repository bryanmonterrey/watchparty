import { Metadata } from "next";
import { ShopView } from "@/components/community/shop-view";

export const metadata: Metadata = {
    title: "Shop",
};

export default function ShopPage() {
    return <ShopView />;
}
