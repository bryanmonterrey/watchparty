import { Switch } from "@/components/ui/switch";
import { useAtom } from "jotai";
import { hideSmallBalancesAtom, hideUnknownTokensAtom, hideReportedActivityAtom } from "../../store/wallet-settings";
import { DrawerScreen, DrawerSection, DrawerRow } from "../../components/drawer-chrome";

interface BalancesViewProps {
    onBack: () => void;
}

export function BalancesView({ onBack }: BalancesViewProps) {
    const [hideSmallBalances, setHideSmallBalances] = useAtom(hideSmallBalancesAtom);
    const [hideUnknownTokens, setHideUnknownTokens] = useAtom(hideUnknownTokensAtom);
    const [hideReportedActivity, setHideReportedActivity] = useAtom(hideReportedActivityAtom);

    return (
        <DrawerScreen title="Balances and activity" onBack={onBack} bodyClassName="space-y-5 p-4 pt-1">
            <DrawerSection label="Portfolio">
                <DrawerRow
                    title="Hide small balances"
                    description="Balances under $1 won't show in your portfolio."
                    control={<Switch checked={hideSmallBalances} onCheckedChange={setHideSmallBalances} />}
                />
                <DrawerRow
                    title="Hide unknown coins"
                    description="Potential scam coins won't show in your portfolio."
                    control={<Switch checked={hideUnknownTokens} onCheckedChange={setHideUnknownTokens} />}
                />
            </DrawerSection>

            <DrawerSection label="Activity">
                <DrawerRow
                    title="Hide reported activity"
                    description="Transactions reported as spam won't show in your activity feed."
                    control={<Switch checked={hideReportedActivity} onCheckedChange={setHideReportedActivity} />}
                />
            </DrawerSection>
        </DrawerScreen>
    );
}
