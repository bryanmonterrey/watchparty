import { EmptyView } from "@/components/console/empty-view";
import { ZapIcon } from "@hugeicons/core-free-icons";

export default function EventSubscriptionsPage() {
  return (
    <EmptyView
      title="Event subscriptions"
      tagline="Real-time delivery of platform events — coins, trades, and user activity — straight to your app."
      icon={ZapIcon}
      emptyLine="No subscriptions found for this account."
    />
  );
}
