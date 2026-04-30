import { CreditCard, DollarSign, TrendingDown, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatCard } from "@/components/layout/backend/shared/stat-card";
import type { SubscriptionStats } from "@platform/contracts";

type SubscriptionStatsGridProps = {
  stats: SubscriptionStats;
};

export async function SubscriptionStatsGrid({ stats }: SubscriptionStatsGridProps) {
  const t = await getTranslations("admin.billing.subscription.stats");

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t("active")}
        value={stats.activeSubscriptions.toString()}
        icon={Users}
        iconColor="text-green-600"
        iconBgColor="bg-green-100"
        description={t("trialing", { count: stats.trialingSubscriptions })}
      />
      <StatCard
        title={t("attention")}
        value={stats.pastDueSubscriptions.toString()}
        icon={TrendingDown}
        iconColor="text-orange-600"
        iconBgColor="bg-orange-100"
        description={t("canceled", { count: stats.canceledSubscriptions })}
      />
      <StatCard
        title={t("mrr")}
        value={`€${stats.monthlyRecurringRevenue.toFixed(2)}`}
        icon={DollarSign}
        iconColor="text-purple-600"
        iconBgColor="bg-purple-100"
        description={t("mrrDescription")}
      />
      <StatCard
        title={t("arr")}
        value={`€${stats.annualRecurringRevenue.toFixed(2)}`}
        icon={CreditCard}
        iconColor="text-blue-600"
        iconBgColor="bg-blue-100"
        description={t("arrDescription")}
      />
    </div>
  );
}
