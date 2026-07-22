"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarMonth, currentMonth, getMonthRange, shiftMonth } from "@/components/wattsinsight/calendar-month";
import { getIntervalsActivities, syncIntervalsActivities } from "@/lib/api/wattsinsight";

export function CalendarClientWrapper() {
  const t = useTranslations("wattsinsight.calendar");
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const month = searchParams.get("month") ?? currentMonth();
  const range = getMonthRange(month);
  const queryKey = ["wattsinsight", "activities", range] as const;
  const activitiesQuery = useQuery({
    queryKey,
    queryFn: () => getIntervalsActivities(range),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncIntervalsActivities(range),
    async onSuccess(result) {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t("syncSuccess", { count: result.insertedOrUpdated }));
    },
    onError() {
      toast.error(t("syncFailed"));
    },
  });

  function setMonth(nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", nextMonth);
    router.replace(`?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
            {t("previous")}
          </Button>
          <div className="min-w-28 text-center font-medium">{month}</div>
          <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>
            {t("next")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {syncMutation.isPending ? t("syncing") : t("syncNow")}
        </Button>
      </div>

      {activitiesQuery.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : activitiesQuery.isError ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">{t("loadFailed")}</div>
      ) : (
        <CalendarMonth activities={activitiesQuery.data?.activities ?? []} month={month} />
      )}
    </div>
  );
}
