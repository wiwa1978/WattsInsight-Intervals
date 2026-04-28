import type { ApiRequest } from "./credits";

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
      return apiRequest("/payments/checkout", {
        method: "POST",
        body: JSON.stringify({ packageKey }),
      });
    },
  };
}
