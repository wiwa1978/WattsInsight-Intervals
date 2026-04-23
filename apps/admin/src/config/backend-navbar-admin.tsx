import {
  Bell,
  CreditCard,
  LayoutDashboard,
  LucideIcon,
  Logs,
  Percent,
  Ticket,
  Users
} from "lucide-react"

export interface BackendNavAdminItem {
  title: string
  url: string
  icon: LucideIcon
}


export const BackendNavAdminItems: BackendNavAdminItem[] = [
   {
    title: "admin.nav.overview",
    url: "/admin/overview",
    icon: LayoutDashboard,
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
  },
  {
    title: "admin.nav.discounts",
    url: "/admin/discounts",
    icon: Percent,
  },
  {
    title: "admin.nav.vouchers",
    url: "/admin/vouchers",
    icon: Ticket,
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
