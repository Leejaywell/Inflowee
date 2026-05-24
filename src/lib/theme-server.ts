import { cookies } from "next/headers";

import {
  APPEARANCE_COOKIE_NAME,
  THEME_COOKIE_NAME,
  normalizeAppearance,
  normalizeTheme,
  type ThemePreference,
} from "@/lib/theme";

export async function getRequestThemePreference(): Promise<ThemePreference> {
  const cookieStore = await cookies();

  return {
    theme: normalizeTheme(cookieStore.get(THEME_COOKIE_NAME)?.value),
    appearance: normalizeAppearance(cookieStore.get(APPEARANCE_COOKIE_NAME)?.value),
  };
}
