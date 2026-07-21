"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { getBackendNavAdminItems } from "@/config/backend-navbar-admin"
import { getMyApplicationConfig } from "@/lib/api/me"
import { adminQueryKeys } from "@/lib/query/keys"

export interface DashboardNavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface DashboardNavContextValue {
  navItems: DashboardNavItem[]
}

const DashboardNavContext = React.createContext<DashboardNavContextValue | undefined>(undefined)

export function DashboardNavProvider({ children }: { children: React.ReactNode }) {
  const applicationConfigQuery = useQuery({
    queryKey: adminQueryKeys.applicationConfig,
    queryFn: getMyApplicationConfig,
    staleTime: 60_000,
  })
  const navItems = getBackendNavAdminItems(applicationConfigQuery.data)

  return (
    <DashboardNavContext.Provider value={{ navItems }}>
      {children}
    </DashboardNavContext.Provider>
  )
}

export function useDashboardNav() {
  const context = React.useContext(DashboardNavContext)
  if (context === undefined) {
    throw new Error("useDashboardNav must be used within a DashboardNavProvider")
  }
  return context
}
