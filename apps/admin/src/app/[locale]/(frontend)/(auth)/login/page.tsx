"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { SocialAuthButtons } from "@/components/layout/frontend/social-auth-buttons";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authConfig } from "@/config/auth";
import { signInSchema, type SignInInput, magicLinkSchema, type MagicLinkFormValues } from "@/schemas";
import { apiRequest } from "@/lib/api/client";
import { getMainAppLoginUrl } from "@/lib/main-app-url";

const DEFAULT_REDIRECT = "/admin/overview";

async function enforceAdminAccess() {
  const status = await apiRequest<{ success: boolean; data?: { message?: string } }>("/admin/status")
    .then(() => ({ ok: true }))
    .catch(() => ({ ok: false }));

  if (status.ok) {
    return true;
  }

  await authClient.signOut();
  return false;
}

// Determine the default mode based on config
const getDefaultMode = (): "password" | "magicLink" => {
  if (authConfig.magicLinkOnly) return "magicLink";
  return "password";
};

function LoginPageContent() {
  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const localeParam = searchParams.get("locale") || "en";

  // Login mode state
  const [mode, setMode] = React.useState<"password" | "magicLink">(getDefaultMode);
  const [magicLinkSent, setMagicLinkSent] = React.useState(false);
  const [sentEmail, setSentEmail] = React.useState("");

  // Get callbackUrl from query params, with validation
  const callbackUrl = searchParams.get("callbackUrl");
  const redirectTo =
    callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : DEFAULT_REDIRECT;

  // Helper to get translated error message
  const getErrorMessage = (error: { code?: string; message?: string }) => {
    if (error.code) {
      try {
        const translatedMessage = tErrors(error.code as Parameters<typeof tErrors>[0], { default: "" });
        if (translatedMessage) return translatedMessage;
      } catch {
        // Fall back to backend message when translation key is missing.
      }
    }
    return error.message || tErrors("default");
  };

  // Password form
  const passwordForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Magic link form
  const magicLinkForm = useForm<MagicLinkFormValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: "",
    },
  });

  const isPasswordSubmitting = passwordForm.formState.isSubmitting;
  const isMagicLinkSubmitting = magicLinkForm.formState.isSubmitting;

  async function onPasswordSubmit(values: SignInInput) {
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      ...(authConfig.rememberMeEnabled && { rememberMe: values.rememberMe }),
      callbackURL: redirectTo,
    });

    if (error) {
      console.error("[login] signIn.email failed", {
        code: error.code,
        message: error.message,
      });
      passwordForm.setError("root", {
        message: getErrorMessage(error),
      });
      passwordForm.resetField("password");
    } else {
      const allowed = await enforceAdminAccess();
      if (!allowed) {
        await authClient.signOut();
        router.replace(getMainAppLoginUrl(localeParam));
        return;
      }
      router.push(redirectTo);
    }
  }

  async function onMagicLinkSubmit(values: MagicLinkFormValues) {
    const { error } = await authClient.signIn.magicLink({
      email: values.email,
      callbackURL: redirectTo,
    });

    if (error) {
      console.error("[login] signIn.magicLink failed", {
        code: error.code,
        message: error.message,
      });
      magicLinkForm.setError("root", {
        message: getErrorMessage(error),
      });
    } else {
      setSentEmail(values.email);
      setMagicLinkSent(true);
    }
  }

  // Reset magic link state when switching modes
  const switchToPassword = () => {
    setMode("password");
    setMagicLinkSent(false);
    magicLinkForm.reset();
  };

  const switchToMagicLink = () => {
    setMode("magicLink");
    passwordForm.reset();
  };

  // Check if magic link or social auth is enabled
  const showMagicLinkOption = authConfig.enableMagicLink;
  const showPasswordOption = !authConfig.magicLinkOnly;
  const showSocialAuth = authConfig.enableSocialAuth;

  // Magic link success state
  if (magicLinkSent) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
        <Container className="max-w-md">
          <div className="rounded-lg border bg-card p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{t("magicLinkSent")}</h1>
            <p className="text-muted-foreground">
              {t("magicLinkSentDescription", { email: sentEmail })}
            </p>
            <div className="pt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setMagicLinkSent(false);
                  magicLinkForm.reset();
                }}
              >
                {t("magicLinkTryAgain")}
              </Button>
              {showPasswordOption && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={switchToPassword}
                >
                  {t("usePassword")}
                </Button>
              )}
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center py-12">
      <Container className="max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mt-8">
          {/* Password Login Form */}
          {mode === "password" && (
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  {passwordForm.formState.errors.root && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {passwordForm.formState.errors.root.message}
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
                            disabled={isPasswordSubmitting}
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
                            disabled={isPasswordSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                              disabled={isPasswordSubmitting}
                            />
                          </FormControl>
                          <FormLabel className="font-normal cursor-pointer">
                            {t("rememberMe")}
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  )}

                  <Button type="submit" className="w-full" disabled={isPasswordSubmitting}>
                    {isPasswordSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("submitting")}
                      </>
                    ) : (
                      t("submit")
                    )}
                  </Button>

                  {/* Magic Link Toggle */}
                  {showMagicLinkOption && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={switchToMagicLink}
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        {t("useMagicLink")}
                      </Button>
                    </>
                  )}

                  {showSocialAuth && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons callbackUrl={redirectTo} />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

          {/* Magic Link Login Form */}
          {mode === "magicLink" && (
            <Form {...magicLinkForm}>
              <form onSubmit={magicLinkForm.handleSubmit(onMagicLinkSubmit)} className="space-y-4">
                <div className="rounded-lg border bg-card p-6 space-y-4">
                  {magicLinkForm.formState.errors.root && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                      {magicLinkForm.formState.errors.root.message}
                    </div>
                  )}

                  <div className="text-center pb-2">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("magicLinkDescription")}
                    </p>
                  </div>

                  <FormField
                    control={magicLinkForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("email")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            autoComplete="email"
                            disabled={isMagicLinkSubmitting}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isMagicLinkSubmitting}>
                    {isMagicLinkSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("magicLinkSubmitting")}
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" />
                        {t("magicLinkSubmit")}
                      </>
                    )}
                  </Button>

                  {/* Password Toggle */}
                  {showPasswordOption && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={switchToPassword}
                      >
                        {t("usePassword")}
                      </Button>
                    </>
                  )}

                  {showSocialAuth && (
                    <>
                      <div className="relative my-4">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-card px-2 text-muted-foreground">
                            {t("orContinue")}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <SocialAuthButtons callbackUrl={redirectTo} />
                      </div>
                    </>
                  )}
                </div>
              </form>
            </Form>
          )}

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
