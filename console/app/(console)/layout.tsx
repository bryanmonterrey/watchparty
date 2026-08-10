import { SidebarProvider } from "@/components/ui/sidebar";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { ConsoleHeader } from "@/components/console/header";
import { AuthGate } from "@/components/console/auth-gate";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SidebarProvider className="bg-sidebar">
        <ConsoleSidebar />
        <div className="h-svh overflow-hidden lg:p-2 w-full">
          <div className="lg:border lg:rounded-xl overflow-hidden flex flex-col items-center justify-start h-full w-full bg-background">
            <ConsoleHeader />
            <main className="flex-1 overflow-y-auto w-full">{children}</main>
          </div>
        </div>
      </SidebarProvider>
    </AuthGate>
  );
}
