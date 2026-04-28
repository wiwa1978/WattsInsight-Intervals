import type { ApiRequest } from "./credits";

export function createNotificationsApi(apiRequest: ApiRequest) {
  return {
    async list(limit = 20) {
      return apiRequest(`/me/notifications?limit=${limit}`);
    },
    async getUnreadCount() {
      return apiRequest("/me/notifications/unread-count");
    },
    async getActiveBanner() {
      return apiRequest("/me/notifications/active-banner");
    },
    async markAsRead(notificationId: string) {
      return apiRequest(`/me/notifications/${notificationId}/read`, {
        method: "POST",
      });
    },
    async markAllAsRead() {
      return apiRequest("/me/notifications/read-all", {
        method: "POST",
      });
    },
    async delete(notificationId: string) {
      return apiRequest(`/me/notifications/${notificationId}`, {
        method: "DELETE",
      });
    },
  };
}
