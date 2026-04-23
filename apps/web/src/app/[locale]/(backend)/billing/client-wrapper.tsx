"use client";

import { ReactNode, createContext, useContext } from "react";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { creditPackages } from "@/config/billing";
import { createCheckoutSession } from "@/lib/api/me";

interface BillingClientWrapperProps {
  children: ReactNode;
}

interface BillingContextType {
  handlePurchase: (packageKey: string) => Promise<void>;
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error("useBilling must be used within BillingClientWrapper");
  }
  return context;
}

export function BillingClientWrapper({ children }: BillingClientWrapperProps) {
  const t = useTranslations("creditPricing");
  const { data: session } = authClient.useSession();

  const handlePurchase = async (packageKey: string) => {
    if (!session?.user) {
      toast.error("Please login to purchase credits");
      return;
    }

    // Find package to get actual productId
    const selectedPackage = creditPackages.find(pkg => pkg.key === packageKey);
    if (!selectedPackage) {
      toast.error("Package not found");
      return;
    }

    try {
      const checkoutSession = await createCheckoutSession(packageKey);
      if (checkoutSession.data.checkoutUrl) {
        window.location.href = checkoutSession.data.checkoutUrl;
      } else {
        toast.error("No checkout URL returned");
        console.error("No checkout URL returned:", { checkoutSession });
      }
    } catch (error) {
      console.error("Purchase error:", error);
      toast.error("Purchase failed");
    }
  };

  return (
    <BillingContext.Provider value={{ handlePurchase }}>
      <div className="space-y-6">
        {children}
      </div>
    </BillingContext.Provider>
  );
}
