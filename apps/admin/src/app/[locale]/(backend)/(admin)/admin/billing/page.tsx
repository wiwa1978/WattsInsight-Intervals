import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CreditsDashboard } from "@/components/layout/backend/admin/billing/credits-dashboard";
import { SubscriptionFinanceSummary } from "@/components/layout/backend/admin/billing/subscription-finance-summary";
import { SubscriptionPlanDistribution } from "@/components/layout/backend/admin/billing/subscription-plan-distribution";
import { SubscriptionStatsGrid } from "@/components/layout/backend/admin/billing/subscription-stats-grid";
import { SubscriptionEventsTable, SubscriptionTable } from "@/components/layout/backend/admin/billing/subscription-tables";
import { AdminBillingTabs, type AdminBillingSection } from "@/components/layout/backend/admin/billing/admin-billing-tabs";
import { DiscountsSection } from "@/components/layout/backend/admin/billing/discounts-section";
import { VouchersSection } from "@/components/layout/backend/admin/billing/vouchers-section";
import { getMyApplicationConfig } from "@/lib/api/me";
import {
  getAdminBillingSubscriptionEvents,
  getAdminBillingSubscriptionFinanceSummary,
  getAdminBillingSubscriptionPlanDistribution,
  getAdminBillingSubscriptionStats,
  getAdminBillingSubscriptions,
  getAdminCreditsDashboard,
} from "@/lib/services/admin";

type AdminBillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function billingSection(value: string | undefined): AdminBillingSection {
  if (value === "discounts" || value === "vouchers") {
    return value;
  }

  return "overview";
}

export default async function AdminBillingPage({ searchParams }: AdminBillingPageProps) {
  const applicationConfig = await getMyApplicationConfig();

  if (!applicationConfig.billing.enabled) {
    return null;
  }

  const params = (await searchParams) ?? {};
  const activeSection = billingSection(first(params.section));
  const t = await getTranslations("admin.billing");

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <AdminBillingTabs activeSection={activeSection}>
        {activeSection === "discounts" ? (
          <DiscountsSection />
        ) : activeSection === "vouchers" ? (
          <VouchersSection />
        ) : (
          <AdminBillingOverview applicationConfig={applicationConfig} />
        )}
      </AdminBillingTabs>
    </Container>
  );
}

async function AdminBillingOverview({
  applicationConfig,
}: {
  applicationConfig: Awaited<ReturnType<typeof getMyApplicationConfig>>;
}) {
  if (applicationConfig.billing.mode === "subscriptions" && applicationConfig.billing.subscriptionSurfacesEnabled) {
    return <AdminSubscriptionBillingPage />;
  }

  if (!applicationConfig.billing.creditSurfacesEnabled) {
    return null;
  }

  const dashboard = await getAdminCreditsDashboard();
  return <CreditsDashboard initialDashboard={dashboard} />;
}

async function AdminSubscriptionBillingPage() {
  const t = await getTranslations("admin.billing.subscriptionsMode");
  const [stats, financeSummary, distribution, subscriptions, events] = await Promise.all([
    getAdminBillingSubscriptionStats(),
    getAdminBillingSubscriptionFinanceSummary(),
    getAdminBillingSubscriptionPlanDistribution(),
    getAdminBillingSubscriptions(50, 0),
    getAdminBillingSubscriptionEvents(50),
  ]);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <div className="mb-8">
        <SubscriptionStatsGrid stats={stats} />
      </div>

      <div className="mb-8">
        <SubscriptionFinanceSummary summary={financeSummary} />
      </div>

      <div className="mb-8">
        <SubscriptionPlanDistribution distribution={distribution} />
      </div>

      <div className="grid gap-6 lg:grid-cols-1">
        <SubscriptionTable subscriptions={subscriptions.subscriptions} />
        <SubscriptionEventsTable events={events} />
      </div>
    </>
  );
}
