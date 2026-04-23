"use client"

import * as React from "react"

import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { UserDropdown } from "@/components/layout/backend/shared/user-dropdown"
import { CreditProgressBar } from "@/components/layout/backend/shared/credit-progress-bar"

export function BackendSidebarFooter() {
  return (
    <SidebarFooter className="bg-muted/30 border-t pt-2">
      <CreditProgressBar />
      <div className="h-px w-full bg-muted-foreground/30" />
      <div><UserDropdown /></div>
    </SidebarFooter>
  )
}
