import { EmptyView } from "@/components/console/empty-view";
import { FilterIcon } from "@hugeicons/core-free-icons";

export default function StreamingRulesPage() {
  return (
    <EmptyView
      title="Streaming rules"
      tagline="Filter the real-time stream — only the events that match your rules get delivered."
      icon={FilterIcon}
      emptyLine="No streaming rules found for your apps."
    />
  );
}
