export interface ThemeColors {
  bgMain: string;
  bgSidebar: string;
  bgHeader: string;
  bgCard: string;
  bgInput: string;
  bgHover: string;
  bgActive: string;
  fgPrimary: string;
  fgSecondary: string;
  fgMuted: string;
  border: string;
  borderSubtle: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  category: "dark" | "light" | "system";
  colors: ThemeColors;
}

export interface AccentColor {
  id: string;
  name: string;
  hex: string;
  isSystem?: boolean;
}

export interface SystemThemeInfo {
  is_dark: boolean;
  gtk_theme_name: string;
  system_accent: string | null;
}

export interface GtkThemeSummary {
  name: string;
  path: string;
  is_dark: boolean;
  accent_hint: string | null;
}

export interface ParsedGtkColors {
  name: string;
  is_dark: boolean;
  bg_main: string;
  bg_sidebar: string;
  bg_input: string;
  fg_primary: string;
  fg_muted: string;
  accent: string;
  border: string;
}

export interface UserThemeConfig {
  presetId: string;
  accentId: string;
  customAccentHex?: string;
  highContrast: boolean;
  gtkThemePath?: string;
  useSystemTheme: boolean;
}
