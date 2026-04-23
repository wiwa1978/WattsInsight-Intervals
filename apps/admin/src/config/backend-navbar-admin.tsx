import {
  Bell,
  CreditCard,
  LayoutDashboard,
  LucideIcon,
  Percent,
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
    title: "admin.nav.notifications",
    url: "/admin/notifications",
    icon: Bell,
  },
  
]
