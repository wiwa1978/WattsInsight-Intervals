import type { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserSubscription } from "@platform/contracts";

type SubscriptionPlanDistributionProps = {
  subscriptions: UserSubscription[];
  t: ReturnType<typeof useTranslations>;
};

export function SubscriptionPlanDistribution({ subscriptions, t }: SubscriptionPlanDistributionProps) {
  const distribution = Array.from(
    subscriptions.reduce((plans, subscription) => {
      plans.set(subscription.planKey, (plans.get(subscription.planKey) ?? 0) + 1);
      return plans;
    }, new Map<string, number>()),
    ([planKey, count]) => ({ planKey, count }),
  ).sort((a, b) => b.count - a.count || a.planKey.localeCompare(b.planKey));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("planDistribution.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {distribution.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("planDistribution.empty")}</p>
        ) : (
          <div className="space-y-3">
            {distribution.map((entry) => (
              <div key={entry.planKey} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium capitalize">{entry.planKey}</span>
                <span className="text-sm text-muted-foreground">
                  {t("planDistribution.count", { count: entry.count })}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
