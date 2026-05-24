import { cookies, headers } from "next/headers";

import {
  isLocale,
  LOCALE_COOKIE_NAME,
  type Locale,
} from "@/lib/i18n";

function getPreferredLocaleFromHeader(value: string | null): Locale {
  if (!value) {
    return "zh";
  }

  const lowered = value.toLowerCase();

  if (lowered.includes("zh")) {
    return "zh";
  }

  if (lowered.includes("en")) {
    return "en";
  }

  return "zh";
}

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  if (isLocale(cookieLocale)) {
    return cookieLocale;
  }

  const headerStore = await headers();
  return getPreferredLocaleFromHeader(headerStore.get("accept-language"));
}
