import { getBillingCapability, type BillingCapability } from "@platform/frontend-shared";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CreditsDashboard } from "@/components/layout/backend/admin/billing/credits-dashboard";
import { SubscriptionFinanceDashboard } from "@/components/layout/backend/admin/billing/subscription-finance-dashboard";
import { AdminBillingTabs, type AdminBillingSection } from "@/components/layout/backend/admin/billing/admin-billing-tabs";
import { DiscountsSection } from "@/components/layout/backend/admin/billing/discounts-section";
import { VouchersSection } from "@/components/layout/backend/admin/billing/vouchers-section";
import { getMyApplicationConfigServer } from "@/lib/api/me.server";
import {
  getAdminBillingSubscriptionFinanceDashboardServer,
  type AdminSubscriptionFinanceDashboardQuery,
  getAdminCreditsDashboardServer,
} from "@/lib/api/admin.server";

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

function visibleBillingSection(value: string | undefined, capability: BillingCapability): AdminBillingSection {
  const section = billingSection(value);

  if (section === "discounts" && !capability.discountsVisible) {
    return "overview";
  }

  if (section === "vouchers" && !capability.vouchersVisible) {
    return "overview";
  }

  return section;
}

export default async function AdminBillingPage({ searchParams }: AdminBillingPageProps) {
  const applicationConfig = await getMyApplicationConfigServer();
  const capability = getBillingCapability(applicationConfig);

  if (!capability.adminBillingVisible) {
    return <AdminBillingUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const activeSection = visibleBillingSection(first(params.section), capability);

  const t = await getTranslations("admin.billing");

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <AdminBillingTabs
        activeSection={activeSection}
        discountsVisible={capability.discountsVisible}
        vouchersVisible={capability.vouchersVisible}
      >
        {activeSection === "discounts" ? (
          <DiscountsSection />
        ) : activeSection === "vouchers" ? (
          <VouchersSection />
        ) : (
          <AdminBillingOverview capability={capability} searchParams={params} />
        )}
      </AdminBillingTabs>
    </Container>
  );
}

function AdminBillingUnavailable() {
  return (
    <Container className="py-6">
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-3xl font-bold">Billing unavailable</h1>
        <p className="text-muted-foreground mt-2">Billing is not available for this workspace.</p>
      </div>
    </Container>
  );
}

async function AdminBillingOverview({
  capability,
  searchParams,
}: {
  capability: BillingCapability;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (capability.subscriptionsVisible) {
    return <AdminSubscriptionBillingPage discountsVisible={capability.discountsVisible} searchParams={searchParams} />;
  }

  if (!capability.creditsVisible) {
    return (
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="text-xl font-semibold">Billing unavailable</h2>
        <p className="text-muted-foreground mt-2">No billing surfaces are available for this workspace.</p>
      </div>
    );
  }

  const dashboard = await getAdminCreditsDashboardServer();
  return <CreditsDashboard initialDashboard={dashboard} />;
}

async function AdminSubscriptionBillingPage({ discountsVisible, searchParams }: { discountsVisible: boolean; searchParams: Record<string, string | string[] | undefined> }) {
  const financeDashboard = await getAdminBillingSubscriptionFinanceDashboardServer(financeQuery(searchParams));

  return (
    <SubscriptionFinanceDashboard dashboard={financeDashboard} discountsVisible={discountsVisible} />
  );
}

function financeQuery(params: Record<string, string | string[] | undefined>): AdminSubscriptionFinanceDashboardQuery {
  return {
    range: rangeParam(first(params.range)),
    startDate: first(params.startDate),
    endDate: first(params.endDate),
    grouping: groupingParam(first(params.grouping)),
    currency: first(params.currency),
    planKey: first(params.planKey),
    status: statusParam(first(params.status)),
    search: first(params.search),
    subscriptionsPage: numberParam(first(params.subscriptionsPage)),
    subscriptionsSearch: first(params.subscriptionsSearch),
  };
}

function rangeParam(value: string | undefined) {
  return value === "7d" || value === "30d" || value === "90d" || value === "12m" || value === "ytd" ? value : undefined;
}

function groupingParam(value: string | undefined) {
  return value === "day" || value === "week" || value === "month" || value === "year" ? value : undefined;
}

function statusParam(value: string | undefined) {
  return value === "active" || value === "trialing" || value === "past_due" || value === "canceled" || value === "expired" || value === "paused" ? value : undefined;
}

function numberParam(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
