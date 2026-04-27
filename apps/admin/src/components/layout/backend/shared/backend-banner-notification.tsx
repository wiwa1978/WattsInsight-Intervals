import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getActiveBannerNotifications,
  markAsRead,
} from "@/lib/services/notifications";

export async function BackendBannerNotification() {
  const result = await getActiveBannerNotifications();
  const banner = result.success ? result.data : null;

  if (!banner) {
    return null;
  }

  const bannerId = banner.id;

  async function dismiss() {
    "use server";

    await markAsRead(bannerId);
  }

  return (
    <div className="mb-6 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{banner.title}</p>
          <p className="text-sm text-amber-900">{banner.message}</p>
        </div>
        <form action={dismiss}>
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            aria-label="Dismiss notification"
            className="text-amber-950 hover:bg-amber-100 hover:text-amber-950"
          >
            <X className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
