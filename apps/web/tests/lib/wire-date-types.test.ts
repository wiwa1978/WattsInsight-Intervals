import type { Session } from "../../src/components/layout/backend/settings/active-sessions-card";
import type { Passkey } from "../../src/components/layout/backend/settings/passkeys-card";
import type { getCreditHistory, getCreditPurchases } from "../../src/lib/services/credits";
import type { getActiveBannerNotifications, getNotifications } from "../../src/lib/services/notifications";

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

type CreditHistoryItem = Awaited<ReturnType<typeof getCreditHistory>>[number];
type CreditPurchaseItem = Awaited<ReturnType<typeof getCreditPurchases>>[number];
type NotificationItem = Extract<Awaited<ReturnType<typeof getNotifications>>, { data: unknown }>["data"][number];
type ActiveBannerNotification = NonNullable<Awaited<ReturnType<typeof getActiveBannerNotifications>>["data"]>;

type SessionCreatedAtIsWireString = Expect<Equal<Session["createdAt"], string>>;
type SessionUpdatedAtIsWireString = Expect<Equal<Session["updatedAt"], string>>;
type SessionExpiresAtIsWireString = Expect<Equal<Session["expiresAt"], string>>;
type PasskeyCreatedAtIsWireString = Expect<Equal<Passkey["createdAt"], string | null | undefined>>;
type CreditHistoryCreatedAtIsWireString = Expect<Equal<CreditHistoryItem["createdAt"], string>>;
type CreditPurchaseCreatedAtIsWireString = Expect<Equal<CreditPurchaseItem["createdAt"], string>>;
type NotificationCreatedAtIsWireString = Expect<Equal<NotificationItem["createdAt"], string>>;
type NotificationUpdatedAtIsWireString = Expect<Equal<NotificationItem["updatedAt"], string>>;
type NotificationBannerExpiresAtIsWireString = Expect<Equal<NotificationItem["bannerExpiresAt"], string | null>>;
type ActiveBannerCreatedAtIsWireString = Expect<Equal<ActiveBannerNotification["createdAt"], string>>;
