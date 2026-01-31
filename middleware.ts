// middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const LOCALE_COOKIE = "rc_locale";

// Countries you care about (based on your travel + target clients)
const ES_COUNTRIES = new Set(["AR", "CL", "CO", "EC", "PE"]);
const PT_COUNTRIES = new Set(["BR"]);

function getCountry(req: NextRequest): string | null {
  // Vercel (most common)
  const vercelCountry =
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("x-vercel-country");

  // Cloudflare / other CDNs (optional fallback)
  const cfCountry = req.headers.get("cf-ipcountry");

  const country = (vercelCountry || cfCountry || "").trim().toUpperCase();
  return country ? country : null;
}

function pickLocaleFromCountry(country: string | null): "en" | "es" | "pt" {
  if (!country) return "en";
  if (ES_COUNTRIES.has(country)) return "es";
  if (PT_COUNTRIES.has(country)) return "pt";
  return "en";
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const path = req.nextUrl.pathname;

  // -----------------------------
  // 1) AUTO-SET LOCALE COOKIE (first visit only)
  // -----------------------------
  const isApi = path.startsWith("/api");
  const isNext = path.startsWith("/_next");
  const isStaticFile = /\.[a-zA-Z0-9]+$/.test(path); // e.g. .png, .css, .js, .ico

  if (!isApi && !isNext && !isStaticFile) {
    const existing = req.cookies.get(LOCALE_COOKIE)?.value;
    if (!existing) {
      const country = getCountry(req);
      const locale = pickLocaleFromCountry(country);

      res.cookies.set({
        name: LOCALE_COOKIE,
        value: locale,
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
  }

  // -----------------------------
  // 2) AUTH-PROTECT /dashboard/*
  // -----------------------------
  if (!path.startsWith("/dashboard")) return res;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return res;
}

export const config = {
  matcher: ["/:path*"],
};
