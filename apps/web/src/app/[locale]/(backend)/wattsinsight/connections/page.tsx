import { getTranslations } from "next-intl/server";

import { ConnectionsClientWrapper } from "./client-wrapper";

export default async function WattsInsightConnectionsPage() {
  const t = await getTranslations("wattsinsight.connections");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <ConnectionsClientWrapper />
    </div>
  );
}
