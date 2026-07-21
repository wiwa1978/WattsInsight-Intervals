"use client";

import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { routing, type Locale } from "@/i18n/routing";
import { useRouter } from "@/i18n/navigation";
import { updateUser, useSession } from "@/lib/auth-client";

export function PreferencesCard() {
  const t = useTranslations("settings.preferences");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { data: session } = useSession();

  async function handleLocaleChange(nextLocale: Locale) {
    localStorage.setItem("preferred-locale", nextLocale);

    if (session?.user) {
      const { error } = await updateUser({ locale: nextLocale });
      if (error) {
        toast.error(error.message || t("error"));
        return;
      }
    }

    toast.success(t("success"));
    router.replace("/settings", { locale: nextLocale });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label>{t("language")}</Label>
        <Select value={locale} onValueChange={(value) => handleLocaleChange(value as Locale)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {routing.locales.map((item) => (
              <SelectItem key={item} value={item}>{t(`languages.${item}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
