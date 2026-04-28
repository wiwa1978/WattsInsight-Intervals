export type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createCreditsApi(apiRequest: ApiRequest) {
  return {
    async getBalance() {
      return apiRequest("/me/credits/balance");
    },
    async getHistory(limit = 50) {
      return apiRequest(`/me/credits/history?limit=${encodeURIComponent(String(limit))}`);
    },
    async getPurchases(limit = 50) {
      return apiRequest(`/me/credits/purchases?limit=${encodeURIComponent(String(limit))}`);
    },
    async downloadInvoice(paymentId: string) {
      return apiRequest("/me/credits/invoice", {
        method: "POST",
        body: JSON.stringify({ paymentId }),
      });
    },
  };
}
