"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Container } from "@/components/ui/container";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient, twoFactor } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { signInSchema } from "@/schemas";
import { getMainAppLoginUrl } from "@/lib/main-app-url";
import { completeAdminStepUp, getAdminStepUpStatus, prepareAdminTotpEnrollment } from "@/lib/services/admin";

const DEFAULT_REDIRECT = "/admin/overview";

const adminLoginSchema = signInSchema.extend({
  adminSecret: z.string().min(1, "Admin secret is required"),
  totpCode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit authentication code").optional().or(z.literal("")),
});

type AdminLoginInput = z.infer<typeof adminLoginSchema>;

async function enforceAdminAccess() {
  try {
    const status = await getAdminStepUpStatus();
    return { allowed: true, stepUpRequired: status.data.stepUpRequired };
  } catch {
    return { allowed: false, stepUpRequired: true };
  }
}

function LoginPageContent() {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const localeParam = searchParams.get("locale") || "en";
  const reason = searchParams.get("reason");
  const needsStepUp = reason === "admin-step-up";
  const [enrollmentSecret, setEnrollmentSecret] = React.useState<string | null>(null);
  const [enrollmentUri, setEnrollmentUri] = React.useState<string | null>(null);
  const [enrollmentQrCode, setEnrollmentQrCode] = React.useState<string | null>(null);
  const [totpCodeRequired, setTotpCodeRequired] = React.useState(false);

  const callbackUrl = searchParams.get("callbackUrl");
  const redirectTo = callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : DEFAULT_REDIRECT;

  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      try {
        const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
        if (translatedMessage) return translatedMessage;
      } catch {
        // fall through
      }
    }
    return error.message || tErrors("default");
  };

  const passwordForm = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      adminSecret: "",
      totpCode: "",
    },
  });

  const isSubmitting = passwordForm.formState.isSubmitting;
  const showTotpCode = totpCodeRequired || Boolean(enrollmentSecret);

  React.useEffect(() => {
    if (!enrollmentUri) {
      setEnrollmentQrCode(null);
      return;
    }

    let active = true;
    QRCode.toDataURL(enrollmentUri, { width: 220, margin: 2 })
      .then((dataUrl) => {
        if (active) {
          setEnrollmentQrCode(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setEnrollmentQrCode(null);
        }
      });

    return () => {
      active = false;
    };
  }, [enrollmentUri]);

  async function onPasswordSubmit(values: AdminLoginInput) {
    const { data, error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      ...(authConfig.rememberMeEnabled && { rememberMe: values.rememberMe }),
    });

    if (error) {
      passwordForm.setError("root", { message: getErrorMessage(error) });
      passwordForm.resetField("password");
      return;
    }

    const signInNeedsTotp = Boolean((data as { twoFactorRedirect?: boolean } | null | undefined)?.twoFactorRedirect);
    if (signInNeedsTotp) {
      setTotpCodeRequired(true);

      if (!values.totpCode) {
        passwordForm.setError("totpCode", {
          message: "Enter a valid 6-digit authentication code",
        });
        return;
      }

      const verify = await twoFactor.verifyTotp({ code: values.totpCode });
      if (verify.error) {
        passwordForm.setError("totpCode", {
          message: "Enter a valid 6-digit authentication code",
        });
        return;
      }
    }

    const status = await enforceAdminAccess();
    if (!status.allowed) {
      await authClient.signOut();
      router.replace(getMainAppLoginUrl(localeParam));
      return;
    }

    try {
      const current = await getAdminStepUpStatus();
      const statusPayload = current.data;
      if (statusPayload.totpRequired && !statusPayload.twoFactorEnabled) {
        if (!statusPayload.canEnrollTotp) {
          passwordForm.setError("root", {
            message: "Invalid admin credentials. Please check the admin secret and authentication code.",
          });
          await authClient.signOut();
          return;
        }

        if (!enrollmentSecret) {
          await prepareAdminTotpEnrollment({ secret: values.adminSecret });

          const setup = await twoFactor.enable({ password: values.password });
          const setupData = setup && typeof setup === "object" && "data" in setup
            ? (setup as { data?: { totpURI?: string } | null }).data
            : undefined;
          const setupError = setup && typeof setup === "object" && "error" in setup
            ? (setup as { error?: { message?: string } | null }).error
            : undefined;
          const totpUri = setupData?.totpURI;
          const secret = totpUri?.match(/secret=([^&]+)/)?.[1] ?? null;

          if (!secret || setupError) {
            passwordForm.setError("root", {
              message: "Two-factor authentication must be enabled for admin access.",
            });
            return;
          }

          setEnrollmentSecret(secret);
          setEnrollmentUri(totpUri ?? null);
          setTotpCodeRequired(true);
          return;
        }

        if (!values.totpCode) {
          passwordForm.setError("totpCode", {
            message: "Enter a valid 6-digit authentication code",
          });
          return;
        }

        const verify = await twoFactor.verifyTotp({ code: values.totpCode });
        if (verify.error) {
          passwordForm.setError("totpCode", {
            message: "Enter a valid 6-digit authentication code",
          });
          return;
        }
      }

      await completeAdminStepUp({
        secret: values.adminSecret,
        ...(values.totpCode ? { totpCode: values.totpCode } : {}),
      });
    } catch {
      passwordForm.setError("root", {
        message: "Invalid admin credentials. Please check the admin secret and authentication code.",
      });
      passwordForm.resetField("password");
      passwordForm.resetField("adminSecret");
      passwordForm.resetField("totpCode");
      setEnrollmentSecret(null);
      setEnrollmentUri(null);
      setEnrollmentQrCode(null);
      setTotpCodeRequired(false);
      return;
    }

    try {
      const finalStatus = await getAdminStepUpStatus();
      if (finalStatus.data.stepUpRequired) {
        passwordForm.setError("root", {
          message: "Additional verification is still required before accessing the admin portal.",
        });
        return;
      }
    } catch {
      passwordForm.setError("root", {
        message: "Unable to complete admin verification. Please try again.",
      });
      return;
    }

    router.push(redirectTo);
    setEnrollmentSecret(null);
    setEnrollmentUri(null);
    setEnrollmentQrCode(null);
    setTotpCodeRequired(false);
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <Container className="max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="rounded-lg border bg-card p-6 space-y-4">
                {needsStepUp && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    {t("stepUpRequired")}
                  </div>
                )}

                {passwordForm.formState.errors.root && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {passwordForm.formState.errors.root.message}
                  </div>
                )}

                {enrollmentSecret && (
                  <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
                    <div className="mb-2 font-medium">First-time authenticator setup</div>
                    <p className="mb-3">
                      Add this setup key in your authenticator app, then enter the fresh 6-digit code to finish signing in.
                    </p>
                    {enrollmentQrCode && (
                      <div className="mb-3 flex justify-center">
                        <img
                          src={enrollmentQrCode}
                          alt="Authenticator QR code"
                          className="h-44 w-44 rounded border border-blue-200 bg-white p-2"
                        />
                      </div>
                    )}
                    Setup key for authenticator app: <span className="font-mono">{enrollmentSecret}</span>
                    {enrollmentUri && (
                      <div className="mt-2 break-all text-xs">
                        URI: <span className="font-mono">{enrollmentUri}</span>
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={passwordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("emailPlaceholder")}
                          autoComplete="email"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("password")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={t("passwordPlaceholder")}
                          autoComplete="current-password"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={passwordForm.control}
                  name="adminSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminSecret")}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={t("adminSecretPlaceholder")}
                          autoComplete="off"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {authConfig.adminPortalTotpRequired && showTotpCode && (
                  <FormField
                    control={passwordForm.control}
                    name="totpCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("totpCode")}</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder={t("totpCodePlaceholder")}
                            autoComplete="one-time-code"
                            disabled={isSubmitting}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {authConfig.rememberMeEnabled && (
                  <FormField
                    control={passwordForm.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">{t("rememberMe")}</FormLabel>
                      </FormItem>
                    )}
                  />
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("submitting")}
                    </>
                  ) : (
                    t("submit")
                  )}
                </Button>
              </div>
            </form>
          </Form>

          <div className="mt-4 space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              This workspace is restricted to approved admin accounts.
            </p>

            <div className="text-center">
              <Button variant="outline" asChild>
                <Link href="/">{t("backHome")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
