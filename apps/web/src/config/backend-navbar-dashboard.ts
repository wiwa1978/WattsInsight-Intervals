import { getBillingCapability, type BillingCapabilityInput } from "@platform/frontend-shared";
import { LayoutDashboard, LucideIcon, Settings } from "lucide-react";

export interface BackendNavDashboardItem {
  title: string;
  url: string;
  icon: LucideIcon;
  requiresBillingSurface?: true;
}

type BillingSurfaceConfig = BillingCapabilityInput | null | undefined;


export const BackendNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.overview",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
];

export const UserDropdownNavItems: BackendNavDashboardItem[] = [
  {
    title: "dashboard.nav.settings",
    url: "/settings",
    icon: Settings,
  },
];

function hasBillingSurface(config: BillingSurfaceConfig) {
  if (!config) {
    return true;
  }

  return getBillingCapability(config).userBillingVisible;
}

function filterBillingSurfaceItems<T extends { requiresBillingSurface?: true }>(items: T[], config: BillingSurfaceConfig): T[] {
  const billingEnabled = hasBillingSurface(config);

  return items.filter((item) => !item.requiresBillingSurface || billingEnabled);
}

export function getBackendNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  return filterBillingSurfaceItems(BackendNavItems, config);
}

export function getUserDropdownNavItems(config: BillingSurfaceConfig): BackendNavDashboardItem[] {
  return filterBillingSurfaceItems(UserDropdownNavItems, config);
}
