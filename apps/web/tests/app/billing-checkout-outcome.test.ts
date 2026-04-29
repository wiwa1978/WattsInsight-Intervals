import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

vi.mock("@/lib/auth-session", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/services/credits", () => ({
  getCreditPurchases: vi.fn(),
}));

vi.mock("@/lib/api/me", () => ({
  getMyApplicationConfig: vi.fn(),
}));

vi.mock("@/components/layout/backend/billing/purchase-history", () => ({
  PurchaseHistory: vi.fn(),
}));

vi.mock("@/components/layout/backend/billing/credit-pricing", () => ({
  CreditPricing: vi.fn(),
}));

vi.mock("@/components/layout/backend/billing/redeem-voucher-card", () => ({
  RedeemVoucherCard: vi.fn(),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: vi.fn(),
}));

vi.mock("@/components/layout/backend/billing/transaction-history", () => ({
  TableSkeleton: vi.fn(),
  TransactionHistory: vi.fn(),
}));

vi.mock("../../src/app/[locale]/(backend)/billing/client-wrapper", () => ({
  BillingClientWrapper: vi.fn(),
}));

vi.mock("../../src/app/[locale]/(backend)/billing/subscription-client-wrapper", () => ({
  SubscriptionBillingClientWrapper: vi.fn(),
}));

vi.mock("@/components/layout/backend/billing/subscription-pricing", () => ({
  SubscriptionPricing: vi.fn(),
}));

import { getCheckoutOutcome } from "../../src/app/[locale]/(backend)/billing/page";
import BillingPage from "../../src/app/[locale]/(backend)/billing/page";
import { getMyApplicationConfig } from "../../src/lib/api/me";
import { getServerSession } from "../../src/lib/auth-session";
import { getCreditPurchases } from "../../src/lib/services/credits";

describe("billing checkout outcome", () => {
  it("returns success when the success query param is true", () => {
    expect(getCheckoutOutcome({ success: "true" })).toBe("success");
  });

  it("returns cancel when the cancel query param is true", () => {
    expect(getCheckoutOutcome({ cancel: "true" })).toBe("cancel");
  });

  it("uses the first query param value when repeated values are present", () => {
    expect(getCheckoutOutcome({ success: ["true", "false"] })).toBe("success");
    expect(getCheckoutOutcome({ cancel: ["true", "false"] })).toBe("cancel");
  });

  it("returns null when checkout outcome params are absent", () => {
    expect(getCheckoutOutcome({})).toBeNull();
  });

  it("does not fetch credit purchases in subscription billing mode", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-1" } } as Awaited<ReturnType<typeof getServerSession>>);
    vi.mocked(getMyApplicationConfig).mockResolvedValue({
      billing: {
        enabled: true,
        mode: "subscriptions",
        creditSurfacesEnabled: false,
        subscriptionSurfacesEnabled: true,
      },
      features: {
        vouchers: false,
        discounts: false,
        notifications: true,
      },
    });

    await BillingPage({ searchParams: Promise.resolve({}) });

    expect(getCreditPurchases).not.toHaveBeenCalled();
  });
});
