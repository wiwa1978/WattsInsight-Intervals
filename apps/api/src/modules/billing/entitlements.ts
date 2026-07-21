export type EntitlementKey = "app.access" | "intervals.read" | "intervals.write" | "api.access";

type BillingMode = "credits" | "subscriptions";

type AccessDecision = {
  allowed: boolean;
  reason: "credits_available" | "credits_required" | "subscription_active" | "subscription_required";
};

type EntitlementServiceDeps = {
  billingMode: () => BillingMode;
  credits: {
    getCreditBalance(userId: string): Promise<{ balance: number | string }>;
  };
  subscriptions: {
    getUserSubscription(userId: string): Promise<{ status: string; currentPeriodEnd: Date | string | null } | null>;
  };
};

export function createEntitlementService(deps: EntitlementServiceDeps) {
  async function canAccess(userId: string, _featureKey: EntitlementKey): Promise<AccessDecision> {
    if (deps.billingMode() === "credits") {
      const creditBalance = await deps.credits.getCreditBalance(userId);
      const balance = Number(creditBalance.balance);

      return balance > 0
        ? { allowed: true, reason: "credits_available" }
        : { allowed: false, reason: "credits_required" };
    }

    const subscription = await deps.subscriptions.getUserSubscription(userId);
    const hasActiveStatus = subscription?.status === "active" || subscription?.status === "trialing";
    const periodValid = !subscription?.currentPeriodEnd || new Date(subscription.currentPeriodEnd) >= new Date();

    return hasActiveStatus && periodValid
      ? { allowed: true, reason: "subscription_active" }
      : { allowed: false, reason: "subscription_required" };
  }

  return { canAccess };
}
