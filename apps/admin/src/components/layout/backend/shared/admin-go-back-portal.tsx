"use client";

import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useTranslations } from "next-intl";
import { ArrowLeftToLine } from "lucide-react"
import { Link } from "@/i18n/navigation";


export function AdminGoBackPortal() {
  const t = useTranslations("");

  return (
    <>
    <SidebarMenu className="space-y-1">
      <SidebarMenuItem>
        <SidebarMenuButton asChild className="text-muted-foreground hover:bg-primary/10 hover:text-primary h-auto w-full justify-start rounded-lg py-2 transition-all duration-200">
          <Link href="/dashboard" className="flex cursor-pointer items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ArrowLeftToLine className="h-4 w-4 transition-colors duration-200" />
            </div>
            <span className="text-sm font-medium">Go to User Panel</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
    </>
  );  
}
