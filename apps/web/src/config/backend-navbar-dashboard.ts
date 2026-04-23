import { LayoutDashboard, LucideIcon } from "lucide-react";

export interface BackendNavDashboardItem {
  title: string;
  url: string;
  icon: LucideIcon;
}


export const BackendNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.overview",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
];
