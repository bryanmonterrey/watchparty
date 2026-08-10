import { EmptyView } from "@/components/console/empty-view";
import { WebhookIcon } from "@hugeicons/core-free-icons";

export default function WebhooksPage() {
  return (
    <EmptyView
      title="Webhooks"
      tagline="Signed HTTP callbacks so your servers hear about events the moment they happen."
      icon={WebhookIcon}
      emptyLine="No webhooks found. Webhooks will appear here once configured for your apps."
    />
  );
}
