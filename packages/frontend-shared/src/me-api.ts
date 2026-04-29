import type { ApiRequest } from "./credits";
import type { ApplicationConfig, CreateCheckoutResponse } from "@platform/contracts";

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
    async createSubscriptionCheckoutSession(planKey: string) {
      return apiRequest<CreateCheckoutResponse>("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ billingMode: "subscriptions", planKey }),
      });
    },
  };
}
