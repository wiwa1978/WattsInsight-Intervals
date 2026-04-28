import type {
  getAdminAllPurchases,
  getAdminAllTransactions,
  getAdminUser,
  getAdminUserCreditHistory,
  getAdminUserCreditPurchases,
  getUsers,
} from "../../src/lib/services/admin";
import type { getCreditHistory, getCreditPurchases } from "../../src/lib/services/credits";
import type { getActiveBannerNotifications, getNotifications } from "../../src/lib/services/notifications";
import type { createVoucher, getVoucherById, getVouchers, updateVoucher, updateVoucherStatus } from "../../src/lib/services/vouchers";

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;

type CreditHistoryItem = Awaited<ReturnType<typeof getCreditHistory>>[number];
type CreditPurchaseItem = Awaited<ReturnType<typeof getCreditPurchases>>[number];
type NotificationItem = Extract<Awaited<ReturnType<typeof getNotifications>>, { data: unknown }>["data"][number];
type ActiveBannerNotification = NonNullable<Awaited<ReturnType<typeof getActiveBannerNotifications>>["data"]>;
type AdminUser = NonNullable<Awaited<ReturnType<typeof getAdminUser>>["data"]>;
type AdminUserListItem = Awaited<ReturnType<typeof getUsers>>["data"]["users"][number];
type AdminUserCreditHistoryItem = Awaited<ReturnType<typeof getAdminUserCreditHistory>>[number];
type AdminUserCreditPurchaseItem = Awaited<ReturnType<typeof getAdminUserCreditPurchases>>[number];
type AdminAllTransactionItem = Awaited<ReturnType<typeof getAdminAllTransactions>>["transactions"][number];
type AdminAllPurchaseItem = Awaited<ReturnType<typeof getAdminAllPurchases>>["purchases"][number];
type VoucherItem = Awaited<ReturnType<typeof getVouchers>>["vouchers"][number];
type VoucherDetail = NonNullable<Awaited<ReturnType<typeof getVoucherById>>["voucher"]>;
type VoucherRedemption = NonNullable<VoucherDetail["redemptions"]>[number];
type CreatedVoucher = NonNullable<Awaited<ReturnType<typeof createVoucher>>["voucher"]>;
type UpdatedVoucher = NonNullable<Awaited<ReturnType<typeof updateVoucher>>["voucher"]>;
type StatusUpdatedVoucher = NonNullable<Awaited<ReturnType<typeof updateVoucherStatus>>["voucher"]>;

type CreditHistoryCreatedAtIsWireString = Expect<Equal<CreditHistoryItem["createdAt"], string>>;
type CreditPurchaseCreatedAtIsWireString = Expect<Equal<CreditPurchaseItem["createdAt"], string>>;
type NotificationCreatedAtIsWireString = Expect<Equal<NotificationItem["createdAt"], string>>;
type NotificationUpdatedAtIsWireString = Expect<Equal<NotificationItem["updatedAt"], string>>;
type NotificationBannerExpiresAtIsWireString = Expect<Equal<NotificationItem["bannerExpiresAt"], string | null>>;
type ActiveBannerCreatedAtIsWireString = Expect<Equal<ActiveBannerNotification["createdAt"], string>>;
type AdminUserBanExpiresIsWireString = Expect<Equal<AdminUser["banExpires"], string | null>>;
type AdminUserCreatedAtIsWireString = Expect<Equal<AdminUser["createdAt"], string>>;
type AdminUserUpdatedAtIsWireString = Expect<Equal<AdminUser["updatedAt"], string>>;
type AdminUserListCreatedAtIsWireString = Expect<Equal<AdminUserListItem["createdAt"], string>>;
type AdminUserCreditHistoryCreatedAtIsWireString = Expect<Equal<AdminUserCreditHistoryItem["createdAt"], string>>;
type AdminUserCreditPurchaseCreatedAtIsWireString = Expect<Equal<AdminUserCreditPurchaseItem["createdAt"], string>>;
type AdminAllTransactionCreatedAtIsWireString = Expect<Equal<AdminAllTransactionItem["createdAt"], string>>;
type AdminAllPurchaseCreatedAtIsWireString = Expect<Equal<AdminAllPurchaseItem["createdAt"], string>>;
type VoucherExpiresAtIsWireString = Expect<Equal<VoucherItem["expiresAt"], string | null>>;
type VoucherRedeemedAtIsWireString = Expect<Equal<VoucherItem["redeemedAt"], string | null>>;
type VoucherCreatedAtIsWireString = Expect<Equal<VoucherItem["createdAt"], string>>;
type VoucherUpdatedAtIsWireString = Expect<Equal<VoucherItem["updatedAt"], string>>;
type VoucherDetailCreatedAtIsWireString = Expect<Equal<VoucherDetail["createdAt"], string>>;
type VoucherRedemptionRedeemedAtIsWireString = Expect<Equal<VoucherRedemption["redeemedAt"], string>>;
type VoucherRedemptionCreatedAtIsWireString = Expect<Equal<VoucherRedemption["createdAt"], string>>;
type VoucherRedemptionUpdatedAtIsWireString = Expect<Equal<VoucherRedemption["updatedAt"], string>>;
type CreatedVoucherCreatedAtIsWireString = Expect<Equal<CreatedVoucher["createdAt"], string>>;
type UpdatedVoucherUpdatedAtIsWireString = Expect<Equal<UpdatedVoucher["updatedAt"], string>>;
type StatusUpdatedVoucherExpiresAtIsWireString = Expect<Equal<StatusUpdatedVoucher["expiresAt"], string | null>>;
