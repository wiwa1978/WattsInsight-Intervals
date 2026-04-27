import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/lib/auth-session";
import { getCreditPurchases } from "@/lib/services/credits";
import { PurchaseHistory } from "@/components/layout/backend/billing/purchase-history";
import { CreditPricing } from "@/components/layout/backend/billing/credit-pricing";
import { RedeemVoucherCard } from "@/components/layout/backend/billing/redeem-voucher-card";
import { Separator } from "@/components/ui/separator";
import {
  TransactionHistory,
  TableSkeleton,
} from "@/components/layout/backend/billing/transaction-history";
import { BillingClientWrapper } from "./client-wrapper";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CheckoutOutcome = "success" | "cancel" | null;

export function getCheckoutOutcome(
  searchParams?: Record<string, string | string[] | undefined>
): CheckoutOutcome {
  const success = Array.isArray(searchParams?.success)
    ? searchParams.success[0]
    : searchParams?.success;
  const cancel = Array.isArray(searchParams?.cancel)
    ? searchParams.cancel[0]
    : searchParams?.cancel;

  return success === "true" ? "success" : cancel === "true" ? "cancel" : null;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const checkoutOutcome = getCheckoutOutcome(resolvedSearchParams);
  const t = await getTranslations("billing");

  return (
    <BillingClientWrapper checkoutOutcome={checkoutOutcome}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>

        <CreditPricing showContainer={false} />

        <RedeemVoucherCard />

        <Separator className="my-8" />

        <div className="space-y-6">
          <Suspense fallback={<TableSkeleton />}>
            <PurchaseHistoryWrapper />
          </Suspense>

          <Suspense fallback={<TableSkeleton />}>
            <TransactionHistory />
          </Suspense>
        </div>
      </div>
    </BillingClientWrapper>
  );
}

async function PurchaseHistoryWrapper() {
  const purchases = await getCreditPurchases(50);
  
  return <PurchaseHistory purchases={purchases} />;
}
