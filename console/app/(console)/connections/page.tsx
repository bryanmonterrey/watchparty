import { EmptyView } from "@/components/console/empty-view";
import { ConnectIcon } from "@hugeicons/core-free-icons";

export default function ConnectionsPage() {
  return (
    <EmptyView
      title="Connections"
      tagline="Live streaming connections held by your apps, with status and history."
      icon={ConnectIcon}
      emptyLine="No connections found for your apps."
    />
  );
}
