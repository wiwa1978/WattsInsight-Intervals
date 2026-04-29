import type { ApiRequest } from "./credits";
import type { ApplicationConfig, CreateCheckoutResponse, SubscriptionPayment, UserSubscription } from "@platform/contracts";

export type CountryRecord = {
  id: string;
  name: string;
  code: string;
  language: string;
};

export function createMeApi(apiRequest: ApiRequest) {
  return {
    async getSession() {
      return apiRequest("/me/session");
    },
    async getApplicationConfig() {
      return apiRequest<{ success: boolean; data: ApplicationConfig }>("/me/application-config");
    },
    async getSubscription() {
      return apiRequest<{ success: boolean; data: UserSubscription | null }>("/me/subscription");
    },
    async getSubscriptionPayments(limit = 50) {
      return apiRequest<{ success: boolean; data: SubscriptionPayment[] }>(`/me/subscription/payments?limit=${encodeURIComponent(String(limit))}`);
    },
    async downloadSubscriptionInvoice(paymentId: string) {
      return apiRequest<{ success: boolean; invoiceUrl?: string; error?: string }>("/me/subscription/invoice", {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      });
    },
    async redeemVoucher(code: string) {
      return apiRequest("/me/vouchers/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
    },
    async getCountries(lang: "en" | "fr" | "nl") {
      const result = await apiRequest<{ success: boolean; data: CountryRecord[] }>(`/countries?lang=${lang}`);
      return result.data;
    },
    async createCheckoutSession(packageKey: string) {
      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ packageKey }),
      });
    },
    async createSubscriptionCheckoutSession(planKey: string, discountCode?: string) {
      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ billingMode: "subscriptions", planKey, discountCode }),
      });
    },
  };
}
