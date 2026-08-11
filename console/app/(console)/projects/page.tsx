import { redirect } from "next/navigation";

// No Projects layer (docs/console-execution-plan.md decision — X deleted
// theirs; credentials attach to Apps). The nav item stays for muscle memory
// but sends you to Apps.
export default function ProjectsPage() {
  redirect("/apps");
}
