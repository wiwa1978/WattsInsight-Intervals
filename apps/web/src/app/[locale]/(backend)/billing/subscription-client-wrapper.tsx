"use client";

import { ReactNode, createContext, useContext, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { createSubscriptionCheckoutSession } from "@/lib/api/me";

interface SubscriptionBillingClientWrapperProps {
  children: ReactNode;
  checkoutOutcome: "success" | "cancel" | null;
}

interface SubscriptionBillingContextType {
  appliedDiscountCode: string | null;
  setAppliedDiscountCode: (code: string | null) => void;
  handleSelectPlan: (planKey: string) => Promise<void>;
}

const SubscriptionBillingContext = createContext<SubscriptionBillingContextType | undefined>(undefined);

export function useSubscriptionBilling() {
  const context = useContext(SubscriptionBillingContext);
  if (!context) {
    throw new Error("useSubscriptionBilling must be used within SubscriptionBillingClientWrapper");
  }
  return context;
}

export function SubscriptionBillingClientWrapper({ children, checkoutOutcome }: SubscriptionBillingClientWrapperProps) {
  const t = useTranslations("billing.subscription.checkout");
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<string | null>(null);
  const checkoutMutation = useMutation({
    mutationFn: (planKey: string) => createSubscriptionCheckoutSession(planKey, appliedDiscountCode ?? undefined),
  });

  const handleSelectPlan = async (planKey: string) => {
    try {
      const checkoutSession = await checkoutMutation.mutateAsync(planKey);
      if (checkoutSession.data.checkoutUrl) {
        window.location.href = checkoutSession.data.checkoutUrl;
        return;
      }

      toast.error("No checkout URL returned");
    } catch (error) {
      console.error("Subscription checkout error:", error);
      toast.error("Subscription checkout failed");
    }
  };

  return (
    <SubscriptionBillingContext.Provider value={{ appliedDiscountCode, setAppliedDiscountCode, handleSelectPlan }}>
      <div className="space-y-6">
        {checkoutOutcome === "success" ? (
          <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
            {t("successDescription")}
          </div>
        ) : null}
        {checkoutOutcome === "cancel" ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive shadow-sm">
            {t("cancelDescription")}
          </div>
        ) : null}
        {children}
      </div>
    </SubscriptionBillingContext.Provider>
  );
}
