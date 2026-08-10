import { EmptyView } from "@/components/console/empty-view";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

export default function AppsPage() {
  return (
    <EmptyView
      title="Apps"
      tagline="An app is a set of keys. Connect it to projects to choose what those keys can call."
      icon={DashboardSquare01Icon}
      emptyLine="No apps found — your keys are managed under Keys."
      action={{ label: "Go to Keys", href: "/keys" }}
    />
  );
}
