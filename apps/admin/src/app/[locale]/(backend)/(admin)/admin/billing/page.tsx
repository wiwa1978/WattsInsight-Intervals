import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { StatCard } from "@/components/layout/backend/shared/stat-card";
import { CreditCard, Wallet, TrendingDown, DollarSign } from "lucide-react";
import { RevenueChart } from "@/components/layout/backend/admin/billing/revenue-chart";
import { TransactionHistoryTable } from "@/components/layout/backend/admin/shared/transaction-history-table";
import { PurchaseHistoryTable } from "@/components/layout/backend/admin/shared/purchase-history-table";
import {
  getAdminAllPurchases,
  getAdminAllTransactions,
  getAdminBillingStats,
  getAdminRevenueData,
} from "@/lib/services/admin";
import { Skeleton } from "@/components/ui/skeleton";

export default async function AdminBillingPage() {
  const t = await getTranslations("admin.billing");
  const statsT = await getTranslations("admin.billing.stats");

  // Fetch billing stats
  const stats = await getAdminBillingStats();

  // Fetch revenue data for all time ranges
  const [dailyData, weeklyData, monthlyData, yearlyData] = await Promise.all([
    getAdminRevenueData("daily"),
    getAdminRevenueData("weekly"),
    getAdminRevenueData("monthly"),
    getAdminRevenueData("yearly"),
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
      description: `${Number(stats.purchasedCredits).toFixed(2)} purchased credits + ${Number(stats.bonusCredits).toFixed(2)} bonus`,
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
      description: `across ${Number(stats.totalPurchases).toFixed(0)} purchases`,
    },
  ];

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

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
          <TransactionHistoryTableWrapper />
        </Suspense>
        <Suspense fallback={<TableSkeleton />}>
          <PurchaseHistoryTableWrapper />
        </Suspense>
      </div>
    </Container>
  );
}

async function TransactionHistoryTableWrapper() {
  const t = await getTranslations("admin.billing.transactions");
  const response = await getAdminAllTransactions();
  return (
    <TransactionHistoryTable
      transactions={response.transactions}
      showUserColumns={true}
      enableSearch={true}
      description={t("descriptionAllUsers")}
    />
  );
}

async function PurchaseHistoryTableWrapper() {
  const t = await getTranslations("admin.billing.purchases");
  const response = await getAdminAllPurchases();
  return (
    <PurchaseHistoryTable
      purchases={response.purchases}
      showUserColumns={true}
      enableSearch={true}
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
