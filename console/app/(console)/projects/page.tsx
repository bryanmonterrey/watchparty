import { EmptyView } from "@/components/console/empty-view";
import { Folder01Icon } from "@hugeicons/core-free-icons";

export default function ProjectsPage() {
  return (
    <EmptyView
      title="Projects"
      tagline="A project decides which parts of the watchparty API your apps can call."
      icon={Folder01Icon}
      emptyLine="No projects found for this account."
    />
  );
}
