import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";
import { useIsHydrated } from "@/hooks/use-hydrated";

type DashboardHeaderSession = { user?: { name?: string | null } } | null | undefined;

export function getDashboardWelcomeKey(input: { isHydrated: boolean; isPending: boolean; session: DashboardHeaderSession }) {
    if (!input.isHydrated || input.isPending) return { key: "loading" as const };
    if (input.session?.user) return { key: "welcomeBack" as const, name: input.session.user.name ?? "" };
    return { key: "welcomeGeneric" as const };
}

export function DashboardHeader() {
    const t = useTranslations("dashboard");
    const { data: session, isPending } = useSession();
    const isHydrated = useIsHydrated();
    const welcome = getDashboardWelcomeKey({ isHydrated, isPending, session });
    return (
        <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">
            {welcome.key === "welcomeBack" ? t("welcomeBack", { name: welcome.name }) : t(welcome.key)}
            </p>
        </div>
    )
}
