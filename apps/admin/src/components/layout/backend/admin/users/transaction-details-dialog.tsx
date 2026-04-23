"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

interface TransactionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    userId: string;
    type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment";
    amount: string;
    balanceBefore: string;
    balanceAfter: string;
    description: string;
    referenceType?: string | null;
    referenceId?: string | null;
    metadata?: unknown;
    createdAt: Date;
  } | null;
}

export function TransactionDetailsDialog({
  open,
  onOpenChange,
  transaction,
}: TransactionDetailsDialogProps) {
  if (!transaction) return null;

  const amount = parseFloat(transaction.amount);
  const isPositive = amount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            View detailed information about this credit transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Transaction ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <span className="text-sm font-mono">{transaction.id}</span>
          </div>

          {/* User ID */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">User ID</span>
            <span className="text-sm font-mono">{transaction.userId}</span>
          </div>

          {/* Reference ID */}
          {transaction.referenceId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reference ID</span>
              <span className="text-sm font-mono">{transaction.referenceId}</span>
            </div>
          )}

          {/* Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Date</span>
            <span className="text-sm">{formatDateTime(transaction.createdAt)}</span>
          </div>

          {/* Type */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Type</span>
            <Badge
              variant={
                transaction.type === "purchase"
                  ? "default"
                  : transaction.type === "usage"
                    ? "secondary"
                    : transaction.type === "bonus"
                      ? "outline"
                      : transaction.type === "admin_adjustment"
                        ? "outline"
                        : "destructive"
              }
              className={
                transaction.type === "bonus"
                  ? "bg-green-100 text-green-800 hover:bg-green-200 border-green-300"
                  : ""
              }
            >
              {transaction.type}
            </Badge>
          </div>

          {/* Amount */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span
              className={`text-sm font-medium ${
                isPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {isPositive ? "+" : ""}
              {amount.toFixed(2)}
            </span>
          </div>

          {/* Balance Before */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance Before</span>
            <span className="text-sm font-medium">
              {parseFloat(transaction.balanceBefore).toFixed(2)}
            </span>
          </div>

          {/* Balance After */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance After</span>
            <span className="text-sm font-medium">
              {parseFloat(transaction.balanceAfter).toFixed(2)}
            </span>
          </div>

          {/* Description */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Description</span>
            <span className="text-sm text-right max-w-[60%]">{transaction.description}</span>
          </div>

          {/* Reference Type */}
          {transaction.referenceType && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reference Type</span>
              <span className="text-sm">{transaction.referenceType}</span>
            </div>
          )}

          {/* Metadata */}
          {transaction.metadata != null &&
            typeof transaction.metadata === "object" &&
            Object.keys(transaction.metadata as Record<string, unknown>).length > 0 && (
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Metadata</span>
              <div className="rounded-md border p-3">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(transaction.metadata, null, 2)}
                </pre>
              </div>
            </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
