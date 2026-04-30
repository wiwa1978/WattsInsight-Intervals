"use client";

import * as React from "react";
import { Download, FileJson, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  buildMyDataExportDownloadUrl,
  cancelMyDataExport,
  createMyDataExport,
  listMyDataExports,
  type UserDataExportSummary,
} from "@/lib/api/me";

type ExportWithToken = UserDataExportSummary & { downloadToken?: string };

function formatBytes(value: number | null) {
  if (!value) return null;
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

export function DataExportCard() {
  const t = useTranslations("settings.dataExport");
  const [exports, setExports] = React.useState<ExportWithToken[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRequesting, setIsRequesting] = React.useState(false);
  const [cancelingId, setCancelingId] = React.useState<string | null>(null);

  const loadExports = React.useCallback(async () => {
    setIsLoading(true);
    try {
      setExports(await listMyDataExports());
    } catch {
      toast.error(t("loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadExports();
  }, [loadExports]);

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      const result = await createMyDataExport();
      if (!result.success || !result.data) {
        toast.error(result.error ?? t("failed"));
        return;
      }

      setExports((current) => [result.data!, ...current.filter((item) => item.id !== result.data!.id)]);
      toast.success(t("success"));
    } catch {
      toast.error(t("failed"));
    } finally {
      setIsRequesting(false);
    }
  };

  const handleCancel = async (exportId: string) => {
    setCancelingId(exportId);
    try {
      const result = await cancelMyDataExport(exportId);
      if (!result.success || !result.data) {
        toast.error(result.error ?? t("cancelFailed"));
        return;
      }

      setExports((current) => current.map((item) => (item.id === exportId ? result.data! : item)));
      toast.success(t("cancelSuccess"));
    } catch {
      toast.error(t("cancelFailed"));
    } finally {
      setCancelingId(null);
    }
  };

  const activeExport = exports.find((item) => item.status === "pending" || item.status === "ready");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileJson className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        ) : exports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          exports.slice(0, 3).map((item) => {
            const canDownload = item.status === "ready" && item.downloadToken;
            const canCancel = item.status === "pending" || item.status === "ready";
            const downloadUrl = canDownload ? buildMyDataExportDownloadUrl(item.id, item.downloadToken!) : null;

            return (
              <div key={item.id} className="rounded-md border bg-muted/30 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{t(`status.${item.status}`)}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.createdAt ? t("createdAt", { date: new Date(item.createdAt).toLocaleDateString() }) : t("createdUnknown")}
                      {formatBytes(item.fileSizeBytes) ? ` · ${formatBytes(item.fileSizeBytes)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {downloadUrl && (
                      <Button size="sm" asChild>
                        <a href={downloadUrl} download>
                          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                          {t("downloadButton")}
                        </a>
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelingId === item.id}
                        onClick={() => void handleCancel(item.id)}
                      >
                        {cancelingId === item.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <X className="mr-2 h-4 w-4" aria-hidden="true" />
                        )}
                        {t("cancelButton")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-3">
        <Button onClick={handleRequest} disabled={isRequesting || !!activeExport}>
          {isRequesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {isRequesting ? t("requesting") : t("requestButton")}
        </Button>
        <Button variant="outline" onClick={() => void loadExports()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("refreshButton")}
        </Button>
      </CardFooter>
    </Card>
  );
}
