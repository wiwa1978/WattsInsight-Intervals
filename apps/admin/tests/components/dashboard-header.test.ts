import { describe, expect, it } from "vitest";

async function getHelper() {
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3101";
  process.env.NEXT_PUBLIC_APP_NAME = "Test Admin";
  return import("../../src/components/layout/backend/dashboard/header");
}

describe("getDashboardWelcomeKey", () => {
  it("keeps server and initial client render stable until hydration", () => {
    return getHelper().then(({ getDashboardWelcomeKey }) => {
    expect(getDashboardWelcomeKey({ isHydrated: false, isPending: false, session: { user: { name: "Ada" } } })).toEqual({ key: "loading" });
    });
  });

  it("shows the user-specific welcome after hydration", () => {
    return getHelper().then(({ getDashboardWelcomeKey }) => {
    expect(getDashboardWelcomeKey({ isHydrated: true, isPending: false, session: { user: { name: "Ada" } } })).toEqual({ key: "welcomeBack", name: "Ada" });
    });
  });
});
