import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { DiscountsSection } from "@/components/layout/backend/admin/billing/discounts-section";

export default async function AdminDiscountsPage() {
  const t = await getTranslations("admin.discounts");

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>

      <DiscountsSection />
    </Container>
  );
}
