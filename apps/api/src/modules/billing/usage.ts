import type { ConsumeCreditsResponse, ConsumeFeatureUsageRequest } from "@platform/contracts/wire";

type UsageServiceDeps = {
  billingMode: () => "credits" | "subscriptions";
  features: Record<string, { cost: number }>;
  billingService: {
    consumeCredits(userId: string, input: ConsumeFeatureUsageRequest & { amount: number }): Promise<ConsumeCreditsResponse>;
  };
};

export function createUsageService(deps: UsageServiceDeps) {
  async function consumeFeatureUsage(userId: string, input: ConsumeFeatureUsageRequest): Promise<ConsumeCreditsResponse> {
    if (deps.billingMode() !== "credits") {
      throw new Error("Credit usage is only available in credits billing mode");
    }

    const feature = deps.features[input.featureKey];
    if (!feature) {
      throw new Error(`Unknown billable feature: ${input.featureKey}`);
    }

    return deps.billingService.consumeCredits(userId, {
      ...input,
      amount: feature.cost,
    });
  }

  return { consumeFeatureUsage };
}
