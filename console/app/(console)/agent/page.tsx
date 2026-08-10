import { EmptyView } from "@/components/console/empty-view";
import { SparklesIcon } from "@hugeicons/core-free-icons";

export default function AgentPage() {
  return (
    <EmptyView
      title="Agent"
      tagline="Set up keys, configure webhooks, manage subscriptions — just describe what you want to build."
      icon={SparklesIcon}
      emptyLine="The console agent isn't available for your account yet."
    />
  );
}
