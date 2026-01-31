// lib/locale.ts

export type RCLocale = "en" | "es" | "pt";

export const RC_LOCALE_COOKIE = "rc_locale";

/**
 * Normalize any incoming value to a supported locale.
 */
export function normalizeLocale(v: unknown): RCLocale {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "es" || s === "pt" || s === "en") return s;
  return "en";
}

/**
 * Read a cookie value from document.cookie (client only).
 */
export function getCookieClient(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(name + "=")) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

/**
 * ✅ CLIENT: get locale from cookie.
 */
export function getLocaleClient(): RCLocale {
  const v = getCookieClient(RC_LOCALE_COOKIE);
  return normalizeLocale(v);
}

/**
 * ✅ CLIENT: set locale cookie.
 * - default path "/" so it applies site-wide
 * - 365 day expiry
 * - SameSite=Lax for sane defaults
 */
export function setLocaleClient(locale: RCLocale) {
  if (typeof document === "undefined") return;

  const val = normalizeLocale(locale);
  const days = 365;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();

  document.cookie = `${RC_LOCALE_COOKIE}=${encodeURIComponent(
    val
  )}; Expires=${expires}; Path=/; SameSite=Lax`;
}

/**
 * ✅ SERVER: get locale from cookies().
 *
 * Use like:
 *   import { cookies } from "next/headers";
 *   const locale = getLocaleServer(await cookies());
 */
export function getLocaleServer(
  cookieStore: { get: (name: string) => { value?: string } | undefined }
): RCLocale {
  const v = cookieStore.get(RC_LOCALE_COOKIE)?.value;
  return normalizeLocale(v);
}
