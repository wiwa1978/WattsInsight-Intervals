"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createAdminSubscriptionRefund } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import type { AdminSubscriptionPaymentListItem, SubscriptionEvent, SubscriptionsList } from "@platform/contracts";

type SubscriptionRow = SubscriptionsList["subscriptions"][number];

function statusVariant(status: string) {
  if (status === "active" || status === "trialing") {
    return "default";
  }

  if (status === "past_due" || status === "paused") {
    return "secondary";
  }

  return "outline";
}

export function SubscriptionTable({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const t = useTranslations("admin.billing.subscriptionsMode.subscriptions");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {subscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.user")}</TableHead>
                <TableHead>{t("table.plan")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.periodEnd")}</TableHead>
                <TableHead>{t("table.subscriptionId")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{subscription.userName ?? t("unknownUser")}</span>
                      <span className="text-xs text-muted-foreground">{subscription.userEmail ?? "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{subscription.planKey}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
                    {subscription.cancelAtPeriodEnd ? (
                      <span className="ml-2 text-xs text-muted-foreground">{t("cancelsAtPeriodEnd")}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {subscription.currentPeriodEnd ? formatDateTime(subscription.currentPeriodEnd) : "-"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{subscription.providerSubscriptionId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SubscriptionPaymentsTable({ initialPayments }: { initialPayments: AdminSubscriptionPaymentListItem[] }) {
  const t = useTranslations("admin.billing.subscriptionsMode.payments");
  const queryClient = useQueryClient();
  const [payments, setPayments] = React.useState(initialPayments);
  const [selectedPayment, setSelectedPayment] = React.useState<AdminSubscriptionPaymentListItem | null>(null);
  const [refundReason, setRefundReason] = React.useState("");
  const [adminSecret, setAdminSecret] = React.useState("");
  const refundMutation = useMutation({
    mutationFn: () => {
      if (!selectedPayment?.paymentId) {
        throw new Error(t("refund.missingPayment"));
      }

      return createAdminSubscriptionRefund({
        paymentId: selectedPayment.paymentId,
        reason: refundReason.trim() || undefined,
        secret: adminSecret.trim(),
      });
    },
    onSuccess: async (_result, _variables) => {
      if (selectedPayment) {
        setPayments((current) => current.map((payment) => (
          payment.id === selectedPayment.id ? { ...payment, paymentStatus: "refunded" } : payment
        )));
      }
      toast.success(t("refund.success"));
      setSelectedPayment(null);
      setRefundReason("");
      setAdminSecret("");
      await queryClient.invalidateQueries({ queryKey: ["admin-billing-subscription-payments"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("refund.error"));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.user")}</TableHead>
                <TableHead>{t("table.plan")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.amount")}</TableHead>
                <TableHead>{t("table.payment")}</TableHead>
                <TableHead>{t("table.date")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{payment.userName ?? t("unknownUser")}</span>
                      <span className="text-xs text-muted-foreground">{payment.userEmail ?? "-"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{payment.planKey}</TableCell>
                  <TableCell><Badge variant={payment.paymentStatus === "completed" ? "default" : "outline"}>{payment.paymentStatus}</Badge></TableCell>
                  <TableCell>{formatMoney(payment.priceInclVat, payment.currency)}</TableCell>
                  <TableCell className="font-mono text-xs">{payment.paymentId}</TableCell>
                  <TableCell>{formatDateTime(payment.createdAt)}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" disabled={payment.paymentStatus !== "completed"} onClick={() => setSelectedPayment(payment)}>
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      {t("refund.action")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={Boolean(selectedPayment)} onOpenChange={(open) => !open && setSelectedPayment(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("refund.dialog.title")}</DialogTitle>
            <DialogDescription>{t("refund.dialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium">{selectedPayment?.userEmail}</div>
              <div className="text-muted-foreground">{selectedPayment?.paymentId}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscription-refund-reason">{t("refund.dialog.reason")}</Label>
              <Textarea id="subscription-refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscription-refund-secret">{t("refund.dialog.secret")}</Label>
              <Input id="subscription-refund-secret" type="password" value={adminSecret} onChange={(event) => setAdminSecret(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedPayment(null)}>{t("refund.dialog.cancel")}</Button>
            <Button disabled={!adminSecret.trim() || refundMutation.isPending} onClick={() => refundMutation.mutate()}>
              {refundMutation.isPending ? t("refund.dialog.submitting") : t("refund.dialog.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function SubscriptionEventsTable({ events }: { events: SubscriptionEvent[] }) {
  const t = useTranslations("admin.billing.subscriptionsMode.events");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.event")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.providerSubscription")}</TableHead>
                <TableHead>{t("table.received")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.eventType}</TableCell>
                  <TableCell>{event.status ? <Badge variant={statusVariant(event.status)}>{event.status}</Badge> : "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{event.providerSubscriptionId ?? "-"}</TableCell>
                  <TableCell>{formatDateTime(event.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function formatMoney(cents: number | string | null | undefined, currency = "EUR") {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}
