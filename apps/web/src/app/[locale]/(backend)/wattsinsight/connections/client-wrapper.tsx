"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2Off, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { disconnectIntervals, getIntervalsAuthorizeUrl, getIntervalsStatus } from "@/lib/api/wattsinsight";

const statusQueryKey = ["wattsinsight", "connection-status"] as const;

export function ConnectionsClientWrapper() {
  const t = useTranslations("wattsinsight.connections");
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: getIntervalsStatus,
  });

  const connectMutation = useMutation({
    mutationFn: getIntervalsAuthorizeUrl,
    onSuccess(data) {
      window.location.assign(data.url);
    },
    onError() {
      toast.error(t("connectFailed"));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectIntervals,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: statusQueryKey });
      toast.success(t("disconnectSuccess"));
    },
    onError() {
      toast.error(t("disconnectFailed"));
    },
  });

  if (statusQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (statusQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("statusUnavailable")}</CardTitle>
          <CardDescription>{t("statusUnavailableDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => statusQuery.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const status = statusQuery.data;
  if (!status) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{status.connected ? t("connectedTitle") : t("emptyTitle")}</CardTitle>
        <CardDescription>
          {status.connected ? t("connectedDescription", { athleteId: status.athleteId ?? "-" }) : t("emptyDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row">
        {status.connected ? (
          <Button
            variant="outline"
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
          >
            <Link2Off className="mr-2 h-4 w-4" />
            {disconnectMutation.isPending ? t("disconnecting") : t("disconnect")}
          </Button>
        ) : (
          <Button onClick={() => connectMutation.mutate()} disabled={connectMutation.isPending}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {connectMutation.isPending ? t("connecting") : t("connect")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
