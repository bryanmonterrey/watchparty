import { ProjectsView } from "@/components/console/projects-view";

// Projects — the organizational layer that groups apps (and their keys). This
// page used to redirect to /apps ("no Projects layer"); it's a real surface now
// (org-only, inert plan chip). See docs/console-backlog-plans.md §1.
export default function ProjectsPage() {
  return <ProjectsView />;
}
