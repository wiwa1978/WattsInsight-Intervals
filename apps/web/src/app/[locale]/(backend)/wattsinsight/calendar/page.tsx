import { getTranslations } from "next-intl/server";

import { CalendarClientWrapper } from "./client-wrapper";

export default async function WattsInsightCalendarPage() {
  const t = await getTranslations("wattsinsight.calendar");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>
      <CalendarClientWrapper />
    </div>
  );
}
