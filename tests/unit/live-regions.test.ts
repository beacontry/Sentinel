/**
 * Toast and login messages reach screen readers (WP14, finding #24).
 *
 * ToastProvider rendered each role=status/alert element inside the toast
 * list, so the live region was inserted together with its message; polite
 * regions mounted that way are often never announced, which lost success
 * and info toasts such as order confirmations. The /login and PIN error
 * boxes were conditionally mounted with no role at all, so a wrong
 * password was silent.
 */

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { ToastProvider } from "@/components/ui/toast";
import LoginPage from "@/app/login/page";

describe("ToastProvider", () => {
  const html = renderToStaticMarkup(createElement(ToastProvider, null, "app"));

  it("mounts a polite and an assertive region before any toast exists", () => {
    expect(html).toMatch(/<div role="status"[^>]*class="sr-only"[^>]*><\/div>/);
    expect(html).toMatch(/<div role="alert"[^>]*class="sr-only"[^>]*><\/div>/);
  });
});

describe("LoginPage", () => {
  const html = renderToStaticMarkup(createElement(LoginPage));

  it("keeps an empty role=alert region mounted for the sign-in error", () => {
    expect(html).toMatch(/<div id="login-error" role="alert" class="sr-only"><\/div>/);
  });

  it("does not mark the fields invalid when there is no error", () => {
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });
});
