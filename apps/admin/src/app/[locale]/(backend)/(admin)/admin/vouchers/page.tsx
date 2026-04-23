import { Container } from "@/components/ui/container";
import { VouchersSection } from "@/components/layout/backend/admin/billing/vouchers-section";
import { getTranslations } from "next-intl/server";

export default async function AdminVouchersPage() {
  const t = await getTranslations("admin.vouchers");

  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground mt-2">{t("description")}</p>
      </div>
      <VouchersSection />
    </Container>
  );
}
