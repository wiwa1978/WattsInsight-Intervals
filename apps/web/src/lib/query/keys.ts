export const webQueryKeys = {
  creditBalance: ["me", "credits", "balance"] as const,
  notifications: (limit: number) => ["me", "notifications", limit] as const,
  unreadNotifications: ["me", "notifications", "unread-count"] as const,
  countries: (locale: string) => ["countries", locale] as const,
};
