import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { SubscriptionEvent, SubscriptionsList } from "@platform/contracts";

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

export async function SubscriptionTable({ subscriptions }: { subscriptions: SubscriptionRow[] }) {
  const t = await getTranslations("admin.billing.subscription.subscriptions");

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
                <TableHead>{t("table.dodoSubscription")}</TableHead>
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
                  <TableCell className="font-mono text-xs">{subscription.dodoSubscriptionId}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export async function SubscriptionEventsTable({ events }: { events: SubscriptionEvent[] }) {
  const t = await getTranslations("admin.billing.subscription.events");

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
                <TableHead>{t("table.dodoSubscription")}</TableHead>
                <TableHead>{t("table.received")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.eventType}</TableCell>
                  <TableCell>{event.status ? <Badge variant={statusVariant(event.status)}>{event.status}</Badge> : "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{event.dodoSubscriptionId ?? "-"}</TableCell>
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
