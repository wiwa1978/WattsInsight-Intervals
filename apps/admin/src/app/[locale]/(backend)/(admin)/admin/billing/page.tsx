import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { StatCard } from "@/components/layout/backend/shared/stat-card";
import { CreditCard, Wallet, TrendingDown, DollarSign } from "lucide-react";
import { RevenueChart } from "@/components/layout/backend/admin/billing/revenue-chart";
import { SubscriptionFinanceSummary } from "@/components/layout/backend/admin/billing/subscription-finance-summary";
import { SubscriptionPlanDistribution } from "@/components/layout/backend/admin/billing/subscription-plan-distribution";
import { SubscriptionStatsGrid } from "@/components/layout/backend/admin/billing/subscription-stats-grid";
import { SubscriptionEventsTable, SubscriptionTable } from "@/components/layout/backend/admin/billing/subscription-tables";
import { AdminTransactionHistoryTable } from "@/components/layout/backend/admin/shared/transaction-history-table";
import { AdminPurchaseHistoryTable } from "@/components/layout/backend/admin/shared/purchase-history-table";
import { AdminBillingTabs, type AdminBillingSection } from "@/components/layout/backend/admin/billing/admin-billing-tabs";
import { DiscountsSection } from "@/components/layout/backend/admin/billing/discounts-section";
import { VouchersSection } from "@/components/layout/backend/admin/billing/vouchers-section";
import { getMyApplicationConfig } from "@/lib/api/me";
import {
  getAdminAllPurchases,
  getAdminAllSubscriptions,
  getAdminAllTransactions,
  getAdminBillingStats,
  getAdminBillingSubscriptionEvents,
  getAdminBillingSubscriptionFinanceSummary,
  getAdminBillingSubscriptionPlanDistribution,
  getAdminBillingSubscriptionStats,
  getAdminBillingSubscriptions,
  getAdminRevenueData,
  getAdminSubscriptionStats,
} from "@/lib/services/admin";
import { Skeleton } from "@/components/ui/skeleton";

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

  const statsT = await getTranslations("admin.billing.stats");

  // Fetch billing stats
  const stats = await getAdminBillingStats();

  // Fetch revenue data for all time ranges
  const [dailyData, weeklyData, monthlyData, yearlyData, initialTransactions, initialPurchases] = await Promise.all([
    getAdminRevenueData("daily"),
    getAdminRevenueData("weekly"),
    getAdminRevenueData("monthly"),
    getAdminRevenueData("yearly"),
    getAdminAllTransactions(20, 0),
    getAdminAllPurchases(20, 0),
  ]);

  // Calculate stat values
  const totalAvailableCredits = Number(stats.purchasedCredits) + Number(stats.bonusCredits) - Number(stats.totalCreditsConsumed);

  const billingStats = [
    {
      title: statsT("totalCreditsPurchased"),
      value: Number(stats.totalCreditsPurchased).toFixed(2),
      icon: CreditCard,
      iconColor: "text-green-600",
      iconBgColor: "bg-green-100",
      description: statsT("totalCreditsPurchasedDescription", {
        purchased: Number(stats.purchasedCredits).toFixed(2),
        bonus: Number(stats.bonusCredits).toFixed(2),
      }),
    },
    {
      title: statsT("totalAvailableCredits"),
      value: totalAvailableCredits.toFixed(2),
      icon: Wallet,
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-100",
      description: statsT("totalAvailableCreditsDescription"),
    },
    {
      title: statsT("totalCreditsConsumed"),
      value: Number(stats.totalCreditsConsumed).toFixed(2),
      icon: TrendingDown,
      iconColor: "text-orange-600",
      iconBgColor: "bg-orange-100",
      description: statsT("totalCreditsConsumedDescription"),
    },
    {
      title: statsT("totalRevenue"),
      value: `€${Number(stats.totalRevenue).toFixed(2)}`,
      icon: DollarSign,
      iconColor: "text-purple-600",
      iconBgColor: "bg-purple-100",
      description: statsT("totalRevenueDescription", {
        count: Number(stats.totalPurchases).toFixed(0),
      }),
    },
  ];

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {billingStats.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
            iconColor={stat.iconColor}
            iconBgColor={stat.iconBgColor}
            description={stat.description}
          />
        ))}
      </div>

      {/* Revenue Chart */}
      <div className="mb-8">
        <RevenueChart
          dailyData={dailyData}
          weeklyData={weeklyData}
          monthlyData={monthlyData}
          yearlyData={yearlyData}
        />
      </div>

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-1">
        <Suspense fallback={<TableSkeleton />}>
          <TransactionHistoryTableWrapper initialData={initialTransactions} />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <PurchaseHistoryTableWrapper initialData={initialPurchases} />
        </Suspense>
      </div>
    </>
  );
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

async function TransactionHistoryTableWrapper({ initialData }: { initialData: Awaited<ReturnType<typeof getAdminAllTransactions>> }) {
  const t = await getTranslations("admin.billing.transactions");
  return (
    <AdminTransactionHistoryTable
      initialData={initialData}
      description={t("descriptionAllUsers")}
    />
  );
}

async function PurchaseHistoryTableWrapper({ initialData }: { initialData: Awaited<ReturnType<typeof getAdminAllPurchases>> }) {
  const t = await getTranslations("admin.billing.purchases");
  return (
    <AdminPurchaseHistoryTable
      initialData={initialData}
      description={t("descriptionAllUsers")}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
