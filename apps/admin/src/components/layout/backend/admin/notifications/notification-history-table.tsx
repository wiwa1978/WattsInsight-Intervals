"use client";

import * as React from "react";
import {
  ArrowUpDown,
  CheckCircle,
  AlertCircle,
  Info,
  X,
  Eye,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/utils";
import type { Notification } from "@/schemas/notification";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NotificationHistoryTableProps {
  notifications: Notification[];
  loading?: boolean;
}

export function NotificationHistoryTable({
  notifications,
  loading = false,
}: NotificationHistoryTableProps) {
  const t = useTranslations("admin.notifications.history");
  const [selectedNotification, setSelectedNotification] = React.useState<Notification | null>(null);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case "error":
        return <X className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "info":
        return <Badge variant="secondary">{t("types.info")}</Badge>;
      case "success":
        return <Badge variant="default">{t("types.success")}</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500 text-white">{t("types.warning")}</Badge>;
      case "error":
        return <Badge variant="destructive">{t("types.error")}</Badge>;
      default:
        return <Badge variant="secondary">{t("types.info")}</Badge>;
    }
  };

  const columns: ColumnDef<Notification>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("table.title")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <button
          onClick={() => setSelectedNotification(row.original)}
          className="flex items-center gap-2 hover:bg-muted/50 rounded-md px-2 py-2 w-full text-left transition-colors"
        >
          {getTypeIcon(row.original.type)}
          <span className="font-medium">{row.original.title}</span>
        </button>
      ),
    },
    {
      accessorKey: "type",
      header: t("table.type"),
      cell: ({ row }) => getTypeBadge(row.original.type),
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("table.createdAt")}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="text-sm">
          {formatDateTime(row.original.createdAt)}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={notifications}
        loading={loading}
        loadingText={t("loading")}
        emptyText={t("noNotifications")}
      />
      
      <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNotification && getTypeIcon(selectedNotification.type)}
              {selectedNotification?.title}
            </DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("table.type")}
                </label>
                <div className="mt-1">
                  {selectedNotification && getTypeBadge(selectedNotification.type)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("table.banner")}
                </label>
                <div className="mt-1">
                  {selectedNotification?.showAsBanner ? (
                    <Badge variant="default">{t("table.yes")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("table.no")}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("table.createdAt")}
                </label>
                <div className="mt-1 text-sm">
                  {selectedNotification && formatDateTime(selectedNotification.createdAt)}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {t("table.expiresAt")}
                </label>
                <div className="mt-1 text-sm">
                  {selectedNotification?.bannerExpiresAt
                    ? formatDateTime(selectedNotification.bannerExpiresAt)
                    : "-"}
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Message
              </label>
              <div className="mt-1 text-sm p-3 bg-muted rounded-md">
                {selectedNotification?.message}
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setSelectedNotification(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
