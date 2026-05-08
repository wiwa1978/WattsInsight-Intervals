"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, RefreshCcw } from "lucide-react";

import type { AdminCreditsDashboard } from "@platform/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RevenueChart } from "@/components/layout/backend/admin/billing/revenue-chart";
import { PurchaseHistoryTable } from "@/components/layout/backend/admin/shared/purchase-history-table";
import { TransactionHistoryTable } from "@/components/layout/backend/admin/shared/transaction-history-table";
import { createAdminCreditRefund, getAdminCreditsDashboard } from "@/lib/services/admin";
import type { AdminCreditsDashboardQuery } from "@/lib/api/admin";
import { formatDateTime } from "@/lib/utils";

type CreditPurchase = AdminCreditsDashboard["refundablePurchases"][number];

type CreditsDashboardProps = {
  initialDashboard: AdminCreditsDashboard;
};

const PAGE_SIZE = 20;

function formatCredits(value: number | string | null | undefined) {
  return Number(value ?? 0).toFixed(2);
}

function formatMoney(cents: number | string | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}

function dashboardQuery(query: AdminCreditsDashboardQuery) {
  return ["admin-billing-credits-dashboard", query] as const;
}

export function CreditsDashboard({ initialDashboard }: CreditsDashboardProps) {
  const t = useTranslations("admin.billing.creditsDashboard");
  const statsT = useTranslations("admin.billing.stats");
  const queryClient = useQueryClient();
  const [query, setQuery] = React.useState<AdminCreditsDashboardQuery>({});
  const [refundSearch, setRefundSearch] = React.useState("");
  const [selectedPurchase, setSelectedPurchase] = React.useState<CreditPurchase | null>(null);
  const [refundReason, setRefundReason] = React.useState("");
  const [adminSecret, setAdminSecret] = React.useState("");

  const dashboard = useQuery({
    queryKey: dashboardQuery(query),
    queryFn: () => getAdminCreditsDashboard(query),
    initialData: Object.keys(query).length === 0 ? initialDashboard : undefined,
  });
  const data = dashboard.data ?? initialDashboard;

  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedPurchase?.paymentId) {
        throw new Error(t("refund.missingPayment"));
      }

      return createAdminCreditRefund({
        paymentId: selectedPurchase.paymentId,
        reason: refundReason.trim() || undefined,
        secret: adminSecret.trim(),
      });
    },
    onSuccess: async () => {
      toast.success(t("refund.success"));
      setSelectedPurchase(null);
      setRefundReason("");
      setAdminSecret("");
      await queryClient.invalidateQueries({ queryKey: ["admin-billing-credits-dashboard"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("refund.error"));
    },
  });

  const totalAvailableCredits = Number(data.stats.totalCreditsPurchased) - Number(data.stats.totalCreditsConsumed);

  const statCards = [
    {
      title: statsT("totalCreditsPurchased"),
      value: formatCredits(data.stats.totalCreditsPurchased),
      description: t("stats.receivedBreakdown", {
        purchased: formatCredits(data.stats.purchasedCredits),
        bonus: formatCredits(data.stats.purchaseBonusCredits),
        vouchers: formatCredits(data.stats.voucherCredits),
        adjustments: formatCredits(data.stats.adminAdjustmentCredits),
      }),
    },
    {
      title: statsT("totalAvailableCredits"),
      value: formatCredits(totalAvailableCredits),
      description: statsT("totalAvailableCreditsDescription"),
    },
    {
      title: statsT("totalCreditsConsumed"),
      value: formatCredits(data.stats.totalCreditsConsumed),
      description: statsT("totalCreditsConsumedDescription"),
    },
    {
      title: statsT("totalRevenue"),
      value: new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(data.stats.totalRevenue),
      description: statsT("totalRevenueDescription", { count: Number(data.stats.totalPurchases).toFixed(0) }),
    },
  ];

  const refundColumns: ColumnDef<CreditPurchase>[] = [
    {
      accessorKey: "userEmail",
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          {t("refund.table.user")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.userName || t("unknownUser")}</span>
          <span className="text-xs text-muted-foreground">{row.original.userEmail}</span>
        </div>
      ),
    },
    { accessorKey: "packageKey", header: t("refund.table.package") },
    {
      accessorKey: "priceInclVat",
      header: t("refund.table.amount"),
      cell: ({ row }) => formatMoney(row.original.priceInclVat, row.original.currency ?? "EUR"),
    },
    {
      accessorKey: "paymentId",
      header: t("refund.table.payment"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.paymentId}</span>,
    },
    {
      accessorKey: "createdAt",
      header: t("refund.table.date"),
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
    {
      id: "actions",
      header: t("refund.table.actions"),
      cell: ({ row }) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedPurchase(row.original)}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          {t("refund.action")}
        </Button>
      ),
    },
  ];

  function submitRefundSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery((current) => ({
      ...current,
      creditsRefundsPage: 1,
      creditsRefundsSearch: refundSearch.trim() || undefined,
    }));
  }

  function setPage(type: "purchases" | "refunds", page: number) {
    setQuery((current) => ({
      ...current,
      [type === "purchases" ? "creditsPurchasesPage" : "creditsRefundsPage"]: page,
    }));
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="space-y-2">
              <CardDescription>{stat.title}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <RevenueChart
        dailyData={data.revenue.dailyData}
        weeklyData={data.revenue.weeklyData}
        monthlyData={data.revenue.monthlyData}
        yearlyData={data.revenue.yearlyData}
      />

      <TransactionHistoryTable
        transactions={data.transactions}
        total={data.transactions.length}
        description={t("transactionsDescription")}
      />

      <PurchaseHistoryTable
        purchases={data.purchases}
        total={data.pagination.purchases.totalItems}
        loading={dashboard.isFetching}
        description={t("purchases.description")}
        onSearchPageChange={(state) => {
          setQuery((current) => ({
            ...current,
            creditsPurchasesPage: Math.floor(state.offset / PAGE_SIZE) + 1,
            creditsPurchasesSearch: state.searchEmail,
          }));
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("refund.title")}</CardTitle>
          <CardDescription>{t("refund.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2" onSubmit={submitRefundSearch}>
            <Input value={refundSearch} onChange={(event) => setRefundSearch(event.target.value)} placeholder={t("searchPlaceholder")} />
            <Button type="submit">{t("search")}</Button>
          </form>
          <DataTable columns={refundColumns} data={data.refundablePurchases} loading={dashboard.isFetching} emptyText={t("refund.empty")} />
          <PaginationControls
            page={data.pagination.refunds.page}
            totalPages={data.pagination.refunds.totalPages}
            onPageChange={(page) => setPage("refunds", page)}
          />
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedPurchase)} onOpenChange={(open) => !open && setSelectedPurchase(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refund.dialog.title")}</DialogTitle>
            <DialogDescription>{t("refund.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{selectedPurchase?.userEmail}</div>
              <div className="text-muted-foreground">{selectedPurchase?.paymentId}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">{t("refund.dialog.reason")}</Label>
              <Textarea id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-secret">{t("refund.dialog.secret")}</Label>
              <Input id="refund-secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPurchase(null)}>{t("refund.dialog.cancel")}</Button>
            <Button disabled={!adminSecret.trim() || refundMutation.isPending} onClick={() => refundMutation.mutate()}>
              {refundMutation.isPending ? t("refund.dialog.submitting") : t("refund.dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaginationControls({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  const t = useTranslations("admin.billing.creditsDashboard.pagination");

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t("previous")}
      </Button>
      <span className="text-sm text-muted-foreground">{t("page", { current: page, total: totalPages })}</span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t("next")}
      </Button>
    </div>
  );
}
