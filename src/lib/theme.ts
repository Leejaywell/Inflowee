export const THEME_COOKIE_NAME = "inflowee_theme";
export const APPEARANCE_COOKIE_NAME = "inflowee_appearance";

export const THEME_IDS = ["focus", "radar", "studio", "pulse", "ledger"] as const;
export const APPEARANCES = ["light", "dark"] as const;

export type ThemeId = (typeof THEME_IDS)[number];
export type Appearance = (typeof APPEARANCES)[number];

export type ThemePreference = {
  theme: ThemeId;
  appearance: Appearance;
};

export type ThemeLabels = {
  theme: string;
  appearance: string;
  light: string;
  dark: string;
  themes: Record<ThemeId, string>;
};

type ThemeLayout = "sidebar" | "topbar" | "split" | "compact" | "rail";

type ThemePalette = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  muted: string;
  border: string;
  panel: string;
  panelInk: string;
  panelMuted: string;
  panelBorder: string;
  accent: string;
  accentInk: string;
};

export type ThemePreset = {
  id: ThemeId;
  layout: ThemeLayout;
  label: Record<"zh" | "en", string>;
  description: Record<"zh" | "en", string>;
  radius: string;
  light: ThemePalette;
  dark: ThemePalette;
};

export const themePresets: Record<ThemeId, ThemePreset> = {
  focus: {
    id: "focus",
    layout: "sidebar",
    label: { zh: "专注", en: "Focus" },
    description: { zh: "稳重侧栏，适合日常监控。", en: "Calm sidebar for daily monitoring." },
    radius: "18px",
    light: {
      bg: "#f3f1ea",
      surface: "#ffffff",
      surfaceAlt: "#f6f5f0",
      ink: "#1c1917",
      muted: "#6b6258",
      border: "rgba(28,25,23,0.12)",
      panel: "#11110f",
      panelInk: "#fafaf9",
      panelMuted: "rgba(250,250,249,0.64)",
      panelBorder: "rgba(250,250,249,0.12)",
      accent: "#0057ff",
      accentInk: "#ffffff",
    },
    dark: {
      bg: "#11110f",
      surface: "#1b1a17",
      surfaceAlt: "#24221e",
      ink: "#fafaf9",
      muted: "#b8b0a6",
      border: "rgba(250,250,249,0.13)",
      panel: "#f4f1e8",
      panelInk: "#171512",
      panelMuted: "rgba(23,21,18,0.66)",
      panelBorder: "rgba(23,21,18,0.12)",
      accent: "#9ee493",
      accentInk: "#10140d",
    },
  },
  radar: {
    id: "radar",
    layout: "topbar",
    label: { zh: "雷达", en: "Radar" },
    description: { zh: "横向导航，突出信号概览。", en: "Top navigation with signal-forward framing." },
    radius: "14px",
    light: {
      bg: "#edf7f4",
      surface: "#ffffff",
      surfaceAlt: "#e2f1ed",
      ink: "#09231d",
      muted: "#4f6f66",
      border: "rgba(9,35,29,0.13)",
      panel: "#063b32",
      panelInk: "#effffb",
      panelMuted: "rgba(239,255,251,0.68)",
      panelBorder: "rgba(239,255,251,0.14)",
      accent: "#00a676",
      accentInk: "#052119",
    },
    dark: {
      bg: "#07120f",
      surface: "#0d211c",
      surfaceAlt: "#123029",
      ink: "#effffb",
      muted: "#9fc8bd",
      border: "rgba(239,255,251,0.14)",
      panel: "#b9f8df",
      panelInk: "#062019",
      panelMuted: "rgba(6,32,25,0.66)",
      panelBorder: "rgba(6,32,25,0.13)",
      accent: "#3df0ad",
      accentInk: "#062019",
    },
  },
  studio: {
    id: "studio",
    layout: "split",
    label: { zh: "工作室", en: "Studio" },
    description: { zh: "分栏布局，适合边创建边查看。", en: "Split layout for creating and reviewing together." },
    radius: "10px",
    light: {
      bg: "#f5f7fb",
      surface: "#ffffff",
      surfaceAlt: "#edf1f8",
      ink: "#141923",
      muted: "#606a7c",
      border: "rgba(20,25,35,0.12)",
      panel: "#1a2433",
      panelInk: "#f7fbff",
      panelMuted: "rgba(247,251,255,0.66)",
      panelBorder: "rgba(247,251,255,0.14)",
      accent: "#e4492e",
      accentInk: "#ffffff",
    },
    dark: {
      bg: "#0d1118",
      surface: "#151b25",
      surfaceAlt: "#1d2634",
      ink: "#f7fbff",
      muted: "#aab5c5",
      border: "rgba(247,251,255,0.14)",
      panel: "#f3f7ff",
      panelInk: "#111722",
      panelMuted: "rgba(17,23,34,0.66)",
      panelBorder: "rgba(17,23,34,0.12)",
      accent: "#ff735c",
      accentInk: "#190704",
    },
  },
  pulse: {
    id: "pulse",
    layout: "compact",
    label: { zh: "脉冲", en: "Pulse" },
    description: { zh: "紧凑顶部栏，适合高频查看。", en: "Compact header for high-frequency scanning." },
    radius: "8px",
    light: {
      bg: "#fff7ed",
      surface: "#ffffff",
      surfaceAlt: "#fff1dc",
      ink: "#2d1a0b",
      muted: "#7b5b3a",
      border: "rgba(45,26,11,0.13)",
      panel: "#3a1f0b",
      panelInk: "#fff8ef",
      panelMuted: "rgba(255,248,239,0.66)",
      panelBorder: "rgba(255,248,239,0.14)",
      accent: "#f05a28",
      accentInk: "#ffffff",
    },
    dark: {
      bg: "#170e08",
      surface: "#24160d",
      surfaceAlt: "#2f1f12",
      ink: "#fff8ef",
      muted: "#d8b98f",
      border: "rgba(255,248,239,0.14)",
      panel: "#ffe1b8",
      panelInk: "#241203",
      panelMuted: "rgba(36,18,3,0.66)",
      panelBorder: "rgba(36,18,3,0.12)",
      accent: "#ff9b54",
      accentInk: "#241203",
    },
  },
  ledger: {
    id: "ledger",
    layout: "rail",
    label: { zh: "清单", en: "Ledger" },
    description: { zh: "窄导航清单，信息密度更高。", en: "Narrow rail with higher information density." },
    radius: "6px",
    light: {
      bg: "#f8f8f5",
      surface: "#ffffff",
      surfaceAlt: "#eeeeea",
      ink: "#181816",
      muted: "#686862",
      border: "rgba(24,24,22,0.14)",
      panel: "#20201d",
      panelInk: "#f7f7f2",
      panelMuted: "rgba(247,247,242,0.66)",
      panelBorder: "rgba(247,247,242,0.14)",
      accent: "#2f6fed",
      accentInk: "#ffffff",
    },
    dark: {
      bg: "#0f100e",
      surface: "#191a17",
      surfaceAlt: "#22231f",
      ink: "#f7f7f2",
      muted: "#b7b8af",
      border: "rgba(247,247,242,0.15)",
      panel: "#f0f0e8",
      panelInk: "#161713",
      panelMuted: "rgba(22,23,19,0.66)",
      panelBorder: "rgba(22,23,19,0.13)",
      accent: "#8fb3ff",
      accentInk: "#071225",
    },
  },
};

export function isThemeId(value: string | undefined | null): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function isAppearance(value: string | undefined | null): value is Appearance {
  return APPEARANCES.includes(value as Appearance);
}

export function normalizeTheme(value: string | undefined | null): ThemeId {
  return isThemeId(value) ? value : "focus";
}

export function normalizeAppearance(value: string | undefined | null): Appearance {
  return isAppearance(value) ? value : "light";
}

export function getThemePreset(theme: ThemeId): ThemePreset {
  return themePresets[theme];
}

export function getThemeCssVariables(preference: ThemePreference) {
  const preset = getThemePreset(preference.theme);
  const palette = preset[preference.appearance];

  return {
    "--app-bg": palette.bg,
    "--app-surface": palette.surface,
    "--app-surface-alt": palette.surfaceAlt,
    "--app-ink": palette.ink,
    "--app-muted": palette.muted,
    "--app-border": palette.border,
    "--app-panel": palette.panel,
    "--app-panel-ink": palette.panelInk,
    "--app-panel-muted": palette.panelMuted,
    "--app-panel-border": palette.panelBorder,
    "--app-accent": palette.accent,
    "--app-accent-ink": palette.accentInk,
    "--app-radius": preset.radius,
  } as const;
}
