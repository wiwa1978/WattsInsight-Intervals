// Discount type definitions
export type DiscountType = "fixed" | "percentage";
export type DiscountStatus = "active" | "inactive" | "expired";

export interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: string; // Stored as decimal string
  startDate: Date;
  endDate: Date;
  maxUses: number | null;
  currentUses: number;
  dodoDiscountId: string | null;
  status: DiscountStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscountWithUsers extends Discount {
  userDiscounts: UserDiscount[];
  _count?: {
    userDiscounts: number;
  };
}

export interface UserDiscount {
  id: string;
  discountId: string;
  userId: string;
  usedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  discount?: Discount;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

// Form types
export interface DiscountFormData {
  code: string;
  type: DiscountType;
  value: number;
  startDate: Date;
  endDate: Date;
  maxUses?: number;
  userIds: string[];
  sendEmail?: boolean;
  sendNotification?: boolean;
}

export interface CreateDiscountInput {
  code: string;
  type: DiscountType;
  value: number;
  startDate: Date;
  endDate: Date;
  maxUses?: number;
  userIds?: string[];
  sendEmail?: boolean;
  sendNotification?: boolean;
}

export interface UpdateDiscountInput {
  id: string;
  code?: string;
  type?: DiscountType;
  value?: number;
  startDate?: Date;
  endDate?: Date;
  maxUses?: number;
  status?: DiscountStatus;
  sendEmail?: boolean;
  sendNotification?: boolean;
}

export interface AssignDiscountInput {
  discountId: string;
  userIds: string[];
}

export interface RemoveDiscountInput {
  discountId: string;
  userIds: string[];
}

// API response types
export interface DiscountListResponse {
  discounts: DiscountWithUsers[];
  total: number;
  hasMore: boolean;
}

export type DiscountResponse =
  | {
      success: true;
      discount: DiscountWithUsers;
    }
  | {
      success: false;
      discount: null;
      error: string;
    };

export type DiscountActionResult =
  | {
      success: true;
      discount?: Discount;
      message?: string;
      assignedCount?: number;
      removedCount?: number;
    }
  | {
      success: false;
      error: string;
    };

// ============================================================================
// Dodo Payments API Types
// ============================================================================

/**
 * Discount type enum for Dodo Payments API
 * Note: Dodo Payments only supports percentage-based discounts
 * - percentage: Percentage-based discount (e.g., 540 basis points = 5.4%)
 */
export type DodoDiscountType = "percentage";

/**
 * Response from Dodo Payments when creating/retrieving a discount
 */
export interface DodoDiscount {
  amount: number; // integer<int32> - basis points for percentage (e.g., 540 = 5.4%)
  business_id: string;
  code: string | null;
  created_at: string; // ISO 8601 date-time
  discount_id: string;
  expires_at: string | null; // ISO 8601 date-time
  name: string | null;
  restricted_to: string[] | null; // List of product IDs
  subscription_cycles: number | null; // integer<int32>
  times_used: number; // integer<int32>
  type: DodoDiscountType; // always "percentage"
  usage_limit: number | null; // integer<int32>
}

/**
 * Request body for creating a discount in Dodo Payments
 */
export interface DodoCreateDiscountRequest {
  amount: number; // integer<int32> required - basis points (e.g., 540 = 5.4%)
  type: DodoDiscountType; // always "percentage"
  code: string | null; // optional
  expires_at: string | null; // ISO 8601 date-time, optional
  name: string | null; // optional
  restricted_to: string[] | null; // List of product IDs, optional
  subscription_cycles: number | null; // integer<int32>, optional
  usage_limit: number | null; // integer<int32>, optional, must be >= 1 if provided
}

/**
 * Request body for updating a discount in Dodo Payments
 */
export interface DodoUpdateDiscountRequest {
  amount?: number; // integer<int32> - basis points (e.g., 540 = 5.4%)
  type?: DodoDiscountType; // always "percentage"
  code?: string | null;
  expires_at?: string | null; // ISO 8601 date-time
  name?: string | null;
  restricted_to?: string[] | null; // List of product IDs
  subscription_cycles?: number | null; // integer<int32>
  usage_limit?: number | null; // integer<int32>, must be >= 1 if provided
}
