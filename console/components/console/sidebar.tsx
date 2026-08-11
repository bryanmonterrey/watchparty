"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home01Icon,
  Notification03Icon,
  SparklesIcon,
  Folder01Icon,
  DashboardSquare01Icon,
  Analytics01Icon,
  Key01Icon,
  ZapIcon,
  WebhookIcon,
  ConnectIcon,
  FilterIcon,
  Coins01Icon,
  Invoice01Icon,
  CreditCardIcon,
  Book02Icon,
  LinkSquare02Icon,
  Logout01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { StarMark } from "@/components/icons";
import { useSession, useSignOut } from "@/lib/session";

// The full X-console IA (docs/console-x-reference.md shell section): grouped
// nav, active item highlighted, avatar + sign-out in the footer. Surfaces
// whose backend isn't live yet render their production empty state — no mock
// rows, no dead buttons — and carry a "Soon" pill so the nav communicates
// state, not just location (the Discord-portal badge language).
const NAV_GROUPS: {
  label?: string;
  items: { icon: typeof Home01Icon; label: string; href: string; soon?: boolean }[];
}[] = [
  {
    items: [
      { icon: Home01Icon, label: "Dashboard", href: "/" },
      { icon: Notification03Icon, label: "Notifications", href: "/notifications" },
      { icon: SparklesIcon, label: "Agent", href: "/agent", soon: true },
    ],
  },
  {
    label: "Access",
    items: [
      { icon: Folder01Icon, label: "Projects", href: "/projects" },
      { icon: DashboardSquare01Icon, label: "Apps", href: "/apps" },
      { icon: Key01Icon, label: "Keys", href: "/keys" },
      { icon: Analytics01Icon, label: "Usage", href: "/usage" },
    ],
  },
  {
    label: "Toolbox",
    items: [
      { icon: ZapIcon, label: "Event subscriptions", href: "/event-subscriptions" },
      { icon: WebhookIcon, label: "Webhooks", href: "/webhooks" },
      { icon: ConnectIcon, label: "Connections", href: "/connections" },
      { icon: FilterIcon, label: "Streaming rules", href: "/streaming-rules" },
    ],
  },
  {
    label: "Billing",
    items: [
      { icon: Coins01Icon, label: "Credits", href: "/credits" },
      { icon: Invoice01Icon, label: "Payments", href: "/payments" },
      { icon: CreditCardIcon, label: "Billing information", href: "/billing" },
    ],
  },
];

export function ConsoleSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const signOut = useSignOut();
  const user = session?.user;

  return (
    <Sidebar className="lg:border-r-0!" collapsible="offExamples" {...props}>
      <SidebarHeader className="p-4 pb-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-black">
            <StarMark className="size-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-sm">watchparty</span>
            <span className="text-[10px] text-muted-foreground tracking-wide">
              Developer Console
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
        {NAV_GROUPS.map((group, gi) => (
          <SidebarGroup key={group.label ?? gi} className={gi === 0 ? "p-0" : "p-0 mt-4"}>
            {group.label ? (
              <SidebarGroupLabel className="h-4 pb-4 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
            ) : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={
                        pathname === item.href ||
                        (item.href !== "/" && pathname.startsWith(`${item.href}/`))
                      }
                      className="h-9"
                    >
                      <HugeiconsIcon icon={item.icon} className="size-4" />
                      <span className="text-sm">{item.label}</span>
                      {item.soon ? (
                        <span className="ml-auto rounded-full border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          Soon
                        </span>
                      ) : null}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup className="p-0 mt-4">
          <SidebarGroupLabel className="h-4 pb-4 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            Resources
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <a href="https://docs.watchparty.xyz" target="_blank" rel="noopener noreferrer" />
                  }
                  className="h-9"
                >
                  <HugeiconsIcon icon={Book02Icon} className="size-4" />
                  <span className="text-sm">Documentation</span>
                  <HugeiconsIcon
                    icon={LinkSquare02Icon}
                    className="size-3 ml-auto text-muted-foreground"
                  />
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <div className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-colors">
                <Avatar className="size-8">
                  <AvatarImage src={user?.avatar_url ?? user?.image ?? "/avatar.png"} />
                  <AvatarFallback>
                    {/* House rule: never a letter fallback — the brand avatar. */}
                    <img src="/avatar.png" alt="" className="size-full object-cover" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user?.name ?? ""}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email ?? ""}</p>
                </div>
                <HugeiconsIcon
                  icon={UnfoldMoreIcon}
                  className="size-4 text-muted-foreground shrink-0"
                />
              </div>
            }
          />
          <DropdownMenuContent align="end" className="w-[220px]">
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<a href="https://watchparty.xyz" target="_blank" rel="noopener noreferrer" />}
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-4 mr-2" />
                Open watchparty
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <a href="https://docs.watchparty.xyz" target="_blank" rel="noopener noreferrer" />
                }
              >
                <HugeiconsIcon icon={Book02Icon} className="size-4 mr-2" />
                API docs
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void signOut()}>
              <HugeiconsIcon icon={Logout01Icon} className="size-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
