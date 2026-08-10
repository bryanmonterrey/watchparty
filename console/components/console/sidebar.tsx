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
  Analytics01Icon,
  Key01Icon,
  Coins01Icon,
  Invoice01Icon,
  Book02Icon,
  LinkSquare02Icon,
  Logout01Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { StarMark } from "@/components/icons";
import { useSession, useSignOut } from "@/lib/session";

// The X-console shell anatomy (docs/console-plan.md): grouped nav, active
// item highlighted, avatar + sign-out in the footer. Only surfaces with a
// live backend get a nav item — nothing here is a mock.
const NAV_GROUPS: {
  label?: string;
  items: { icon: typeof Home01Icon; label: string; href: string }[];
}[] = [
  {
    items: [
      { icon: Home01Icon, label: "Dashboard", href: "/" },
      { icon: Analytics01Icon, label: "Usage", href: "/usage" },
    ],
  },
  {
    label: "Access",
    items: [{ icon: Key01Icon, label: "Keys", href: "/keys" }],
  },
  {
    label: "Billing",
    items: [
      { icon: Coins01Icon, label: "Credits", href: "/credits" },
      { icon: Invoice01Icon, label: "Payments", href: "/payments" },
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
                      isActive={pathname === item.href}
                      className="h-9"
                    >
                      <HugeiconsIcon icon={item.icon} className="size-4" />
                      <span className="text-sm">{item.label}</span>
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
