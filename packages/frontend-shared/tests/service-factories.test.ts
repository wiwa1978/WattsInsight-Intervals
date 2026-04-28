import { describe, expect, it, vi } from "vitest";

import { createCreditsApi } from "../src/credits";
import { createNotificationsApi } from "../src/notifications";

describe("service factories", () => {
  it("creates credits helpers using the injected request function", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const credits = createCreditsApi(request);

    await expect(credits.getBalance()).resolves.toEqual({ path: "/me/credits/balance", init: undefined });
    await expect(credits.getHistory(25)).resolves.toEqual({ path: "/me/credits/history?limit=25", init: undefined });
    await expect(credits.getPurchases(10)).resolves.toEqual({ path: "/me/credits/purchases?limit=10", init: undefined });
    await expect(credits.downloadInvoice("pay_123")).resolves.toEqual({
      path: "/me/credits/invoice",
      init: { method: "POST", body: JSON.stringify({ paymentId: "pay_123" }) },
    });
  });

  it("creates notification helpers using the injected request function", async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => ({ path, init }));
    const notifications = createNotificationsApi(request);

    await expect(notifications.list(15)).resolves.toEqual({ path: "/me/notifications?limit=15", init: undefined });
    await expect(notifications.getUnreadCount()).resolves.toEqual({ path: "/me/notifications/unread-count", init: undefined });
    await expect(notifications.getActiveBanner()).resolves.toEqual({ path: "/me/notifications/active-banner", init: undefined });
    await expect(notifications.markAsRead("notif_123")).resolves.toEqual({
      path: "/me/notifications/notif_123/read",
      init: { method: "POST" },
    });
    await expect(notifications.markAllAsRead()).resolves.toEqual({
      path: "/me/notifications/read-all",
      init: { method: "POST" },
    });
    await expect(notifications.delete("notif_123")).resolves.toEqual({
      path: "/me/notifications/notif_123",
      init: { method: "DELETE" },
    });
  });
});
