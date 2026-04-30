import { LayoutDashboard, LucideIcon, Wallet } from "lucide-react";

export interface BackendNavDashboardItem {
  title: string;
  url: string;
  icon: LucideIcon;
  requiresBillingSurface?: true;
}


export const BackendNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.overview",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "dashboard.nav.billing",
    url: "/billing",
    icon: Wallet,
    requiresBillingSurface: true,
  },
];

export function getBackendNavItems(config: {
  billing?: {
    creditSurfacesEnabled?: boolean;
    subscriptionSurfacesEnabled?: boolean;
  };
} | null | undefined): BackendNavDashboardItem[] {
  const billingEnabled = config?.billing?.creditSurfacesEnabled === true || config?.billing?.subscriptionSurfacesEnabled === true;

  return BackendNavItems.filter((item) => !item.requiresBillingSurface || billingEnabled);
}
