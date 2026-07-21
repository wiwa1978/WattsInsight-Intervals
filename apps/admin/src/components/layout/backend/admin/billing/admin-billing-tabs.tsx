"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type AdminBillingSection = "overview" | "discounts" | "vouchers";

type AdminBillingTabsProps = {
  activeSection: AdminBillingSection;
  children: React.ReactNode;
  discountsVisible?: boolean;
  vouchersVisible?: boolean;
};

export function AdminBillingTabs({ activeSection, children, discountsVisible = true, vouchersVisible = true }: AdminBillingTabsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const columnClass = discountsVisible && vouchersVisible ? "grid-cols-3" : discountsVisible || vouchersVisible ? "grid-cols-2" : "grid-cols-1";

  function handleTabChange(value: string) {
    const nextSection = value as AdminBillingSection;
    const nextParams = new URLSearchParams(searchParams.toString());

    if (nextSection === "overview") {
      nextParams.delete("section");
    } else {
      nextParams.set("section", nextSection);
    }

    const query = nextParams.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Tabs value={activeSection} onValueChange={handleTabChange} className="space-y-6">
      <TabsList className={`grid w-full ${columnClass} lg:w-auto lg:inline-grid`}>
        <TabsTrigger value="overview">{t("admin.nav.billing")}</TabsTrigger>
        {discountsVisible ? <TabsTrigger value="discounts">{t("admin.nav.discounts")}</TabsTrigger> : null}
        {vouchersVisible ? <TabsTrigger value="vouchers">{t("admin.nav.vouchers")}</TabsTrigger> : null}
      </TabsList>
      <div>{children}</div>
    </Tabs>
  );
}
