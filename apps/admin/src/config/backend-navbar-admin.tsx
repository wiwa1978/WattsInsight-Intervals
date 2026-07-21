import { getBillingCapability, type BillingCapabilityInput } from "@platform/frontend-shared"
import {
  Bell,
  CreditCard,
  ListChecks,
  ServerCog,
  ShieldCheck,
  LayoutDashboard,
  LucideIcon,
  Logs,
  Users,
  Webhook
} from "lucide-react"

export interface BackendNavAdminItem {
  title: string
  url: string
  icon: LucideIcon
  requiresAdminBillingSurface?: true
}

type BillingSurfaceConfig = BillingCapabilityInput | null | undefined


export const BackendNavAdminItems: BackendNavAdminItem[] = [
   {
    title: "admin.nav.overview",
    url: "/admin/overview",
    icon: LayoutDashboard,
  },

  {
    title: "admin.nav.system",
    url: "/admin/system",
    icon: ServerCog,
  },

  {
    title: "admin.nav.admins",
    url: "/admin/admins",
    icon: ShieldCheck,
  },

  {
    title: "admin.nav.users",
    url: "/admin/users",
    icon: Users,
  },

  {
    title: "admin.nav.billing",
    url: "/admin/billing",
    icon: CreditCard ,
    requiresAdminBillingSurface: true,
  },
  {
    title: "admin.nav.webhooks",
    url: "/admin/webhooks",
    icon: Webhook,
  },
  {
    title: "admin.nav.operations",
    url: "/admin/operations",
    icon: ListChecks,
  },
  {
    title: "admin.nav.notifications",
    url: "/admin/notifications",
    icon: Bell,
  },
  {
    title: "admin.nav.logs",
    url: "/admin/logs",
    icon: Logs,
  },
  
]

function hasAdminBillingSurface(config: BillingSurfaceConfig) {
  if (!config) {
    return true
  }

  return getBillingCapability(config).adminBillingVisible
}

export function getBackendNavAdminItems(config: BillingSurfaceConfig): BackendNavAdminItem[] {
  const billingEnabled = hasAdminBillingSurface(config)

  return BackendNavAdminItems.filter((item) => !item.requiresAdminBillingSurface || billingEnabled)
}
