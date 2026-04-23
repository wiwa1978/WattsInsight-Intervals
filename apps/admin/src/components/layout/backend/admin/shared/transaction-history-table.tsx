"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TransactionDetailsDialog } from "../users/transaction-details-dialog";

export type Transaction = {
  id: string;
  type: "purchase" | "usage" | "refund" | "bonus" | "admin_adjustment";
  amount: string;
  balanceBefore?: string;
  balanceAfter: string;
  description: string;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: unknown;
  createdAt: Date;
  userId?: string;
  userName?: string | null;
  userEmail?: string;
};

interface TransactionHistoryTableProps {
  transactions: Transaction[];
  // Optional: show user columns (default: true)
  showUserColumns?: boolean;
  // Optional: show card wrapper (default: true)
  showCard?: boolean;
  // Optional: enable search (default: true)
  enableSearch?: boolean;
  // Optional: enable row click for details (default: true)
  enableRowClick?: boolean;
  // Optional: custom title and description
  title?: string;
  description?: string;
}

export function TransactionHistoryTable({
  transactions,
  showUserColumns = true,
  showCard = true,
  enableSearch = true,
  enableRowClick = true,
  title,
  description,
}: TransactionHistoryTableProps) {
  const t = useTranslations("admin.billing.transactions");

  // State
  const [searchQuery, setSearchQuery] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [selectedTransaction, setSelectedTransaction] =
    React.useState<Transaction | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  const limit = 20;

  // Filter transactions based on search query
  const filteredTransactions = React.useMemo(() => {
    if (!searchQuery) return transactions;

    const query = searchQuery.toLowerCase();
    return transactions.filter((transaction) => {
      return (
        transaction.userName?.toLowerCase().includes(query) ||
        transaction.userEmail?.toLowerCase().includes(query) ||
        transaction.type.toLowerCase().includes(query) ||
        transaction.description?.toLowerCase().includes(query)
      );
    });
  }, [transactions, searchQuery]);

  const total = filteredTransactions.length;
  const totalPages = Math.ceil(total / limit);

  // Paginate transactions
  const paginatedTransactions = React.useMemo(() => {
    const start = (currentPage - 1) * limit;
    return filteredTransactions.slice(start, start + limit);
  }, [filteredTransactions, currentPage, limit]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
  };

  const handleRowClick = (transaction: Transaction) => {
    if (!enableRowClick) return;
    setSelectedTransaction(transaction);
    setIsDialogOpen(true);
  };

  const getTransactionTypeBadge = (type: string) => {
    const variant =
      type === "purchase"
        ? "default"
        : type === "usage"
          ? "secondary"
          : type === "bonus"
            ? "outline"
            : type === "admin_adjustment"
              ? "outline"
              : "destructive";
    const className =
      type === "bonus"
        ? "bg-green-100 text-green-800 hover:bg-green-200 border-green-300"
        : "";
    return <Badge variant={variant} className={className}>{type}</Badge>;
  };

  const columns: ColumnDef<Transaction>[] = React.useMemo(() => {
    const cols: ColumnDef<Transaction>[] = [];

    // User column
    if (showUserColumns) {
      cols.push({
        accessorKey: "userName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.user")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const transaction = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-medium">{transaction.userName || "Unknown"}</span>
              <span className="text-xs text-muted-foreground">{transaction.userEmail}</span>
            </div>
          );
        },
      });
    }

    cols.push(
      {
        accessorKey: "type",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.type")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => getTransactionTypeBadge(row.original.type),
      },
      {
        accessorKey: "amount",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.amount")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const amount = parseFloat(row.original.amount);
          return (
            <span
              className={
                amount > 0
                  ? "text-green-600 font-medium"
                  : "text-red-600 font-medium"
              }
            >
              {amount > 0 ? "+" : ""}
              {amount.toFixed(2)}
            </span>
          );
        },
      },
      {
        accessorKey: "balanceAfter",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.balance")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {parseFloat(row.original.balanceAfter).toFixed(2)}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: t("table.description"),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.description || "-"}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {t("table.date")}
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDateTime(row.original.createdAt)}
          </span>
        ),
      }
    );

    return cols;
  }, [showUserColumns, t]);

  const from = total > 0 ? (currentPage - 1) * limit + 1 : 0;
  const to = Math.min(currentPage * limit, total);

  const tableContent = (
    <>
      {/* Search */}
      {enableSearch && (
        <form onSubmit={handleSearch} className="mb-6 flex gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit">{t("search")}</Button>
        </form>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={paginatedTransactions}
        loading={false}
        loadingText={t("loading")}
        emptyText={t("noTransactions")}
        onRowClick={enableRowClick ? handleRowClick : undefined}
      />

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            {t("pagination.showing", { from, to, total })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("pagination.previous")}
            </Button>
            <span className="text-sm">
              {t("pagination.page", { current: currentPage, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              {t("pagination.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Transaction Details Dialog */}
      {enableRowClick && selectedTransaction && (
        <TransactionDetailsDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          transaction={{
            ...selectedTransaction,
            userId: selectedTransaction.userId || "",
            balanceBefore: selectedTransaction.balanceBefore || "0",
          }}
        />
      )}
    </>
  );

  if (!showCard) {
    return tableContent;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title || t("title")}</CardTitle>
        <CardDescription>{description || t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {tableContent}
      </CardContent>
    </Card>
  );
}
