import { invoke } from "@tauri-apps/api/core";
import { THEME_PRESETS, ACCENT_COLORS } from "./presets";
import type {
  ThemePreset,
  AccentColor,
  SystemThemeInfo,
  GtkThemeSummary,
  ParsedGtkColors,
  UserThemeConfig,
  ThemeColors,
} from "./types";

const STORAGE_KEY = "corthal_theme_config";

class ThemeStore {
  config = $state<UserThemeConfig>({
    presetId: "charcoal-slate",
    accentId: "cobalt-blue",
    highContrast: false,
    useSystemTheme: false,
  });

  systemInfo = $state<SystemThemeInfo | null>(null);
  installedGtkThemes = $state<GtkThemeSummary[]>([]);
  customGtkColors = $state<ParsedGtkColors | null>(null);
  isLoadingGtk = $state(false);

  currentPreset = $derived.by<ThemePreset>(() => {
    if (this.customGtkColors && this.config.gtkThemePath) {
      const g = this.customGtkColors;
      return {
        id: "custom-gtk",
        name: g.name,
        description: `Импортированная GTK-тема (${g.is_dark ? "тёмная" : "светлая"})`,
        category: "system",
        colors: {
          bgMain: g.bg_main,
          bgSidebar: g.bg_sidebar,
          bgHeader: g.bg_sidebar,
          bgCard: g.bg_input,
          bgInput: g.bg_input,
          bgHover: g.is_dark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.05)",
          bgActive: g.is_dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)",
          fgPrimary: g.fg_primary,
          fgSecondary: g.fg_muted,
          fgMuted: g.fg_muted,
          border: g.border,
          borderSubtle: g.is_dark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)",
        },
      };
    }

    const found = THEME_PRESETS.find((p) => p.id === this.config.presetId);
    return found || THEME_PRESETS[1]; // default charcoal-slate
  });

  currentAccent = $derived.by<AccentColor>(() => {
    if (this.config.customAccentHex) {
      return {
        id: "custom",
        name: "Пользовательский",
        hex: this.config.customAccentHex,
      };
    }
    const found = ACCENT_COLORS.find((a) => a.id === this.config.accentId);
    if (found?.isSystem && this.systemInfo?.system_accent) {
      return {
        ...found,
        hex: this.systemInfo.system_accent,
      };
    }
    return found || ACCENT_COLORS[0];
  });

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      }
    } catch (e) {
      console.warn("Could not load theme config from localStorage:", e);
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      console.warn("Could not save theme config to localStorage:", e);
    }
  }

  async init() {
    try {
      // 1. Detect Linux system theme & GTK settings
      const info = await invoke<SystemThemeInfo>("theme_detect_system");
      this.systemInfo = info;

      // Update system accent in presets list if detected
      if (info.system_accent) {
        const sysAccent = ACCENT_COLORS.find((a) => a.id === "system-accent");
        if (sysAccent) {
          sysAccent.hex = info.system_accent;
        }
      }

      // If user selected useSystemTheme or has saved GTK path
      if (this.config.useSystemTheme) {
        if (!info.is_dark && this.config.presetId !== "nordic-frost-light") {
          this.config.presetId = "nordic-frost-light";
        }
      }

      if (this.config.gtkThemePath) {
        await this.loadGtkTheme(this.config.gtkThemePath);
      }

      // 2. Fetch list of installed GTK themes in background
      this.fetchInstalledGtkThemes();
    } catch (err) {
      console.error("Theme init error:", err);
    } finally {
      this.applyCss();
    }
  }

  async fetchInstalledGtkThemes() {
    try {
      this.isLoadingGtk = true;
      const themes = await invoke<GtkThemeSummary[]>("theme_list_gtk_themes");
      this.installedGtkThemes = themes;
    } catch (err) {
      console.error("Failed to list installed GTK themes:", err);
    } finally {
      this.isLoadingGtk = false;
    }
  }

  async loadGtkTheme(themePath: string) {
    try {
      this.isLoadingGtk = true;
      const colors = await invoke<ParsedGtkColors>("theme_parse_gtk_theme", { themePath });
      this.customGtkColors = colors;
      this.config.gtkThemePath = themePath;
      if (colors.accent && colors.accent.startsWith("#")) {
        // Option to sync accent with GTK
        const sysAccent = ACCENT_COLORS.find((a) => a.id === "system-accent");
        if (sysAccent) {
          sysAccent.hex = colors.accent;
        }
      }
      this.saveToStorage();
      this.applyCss();
    } catch (err) {
      console.error("Failed to parse GTK theme:", err);
      alert("Не удалось загрузить тему GTK: " + err);
    } finally {
      this.isLoadingGtk = false;
    }
  }

  clearGtkTheme() {
    this.customGtkColors = null;
    this.config.gtkThemePath = undefined;
    this.saveToStorage();
    this.applyCss();
  }

  setPreset(presetId: string) {
    this.clearGtkTheme();
    this.config.presetId = presetId;
    this.config.useSystemTheme = false;
    this.saveToStorage();
    this.applyCss();
  }

  setAccent(accentId: string, customHex?: string) {
    this.config.accentId = accentId;
    this.config.customAccentHex = customHex;
    this.saveToStorage();
    this.applyCss();
  }

  toggleHighContrast() {
    this.config.highContrast = !this.config.highContrast;
    this.saveToStorage();
    this.applyCss();
  }

  setUseSystemTheme(enabled: boolean) {
    this.config.useSystemTheme = enabled;
    if (enabled && this.systemInfo) {
      if (this.systemInfo.is_dark) {
        this.config.presetId = "charcoal-slate";
      } else {
        this.config.presetId = "nordic-frost-light";
      }
      if (this.systemInfo.system_accent) {
        this.config.accentId = "system-accent";
      }
    }
    this.saveToStorage();
    this.applyCss();
  }

  applyCss() {
    if (typeof document === "undefined") return;

    const preset = this.currentPreset;
    const accent = this.currentAccent;
    const isHc = this.config.highContrast;
    const colors = preset.colors;

    const root = document.documentElement;

    // Helper for hex to rgba
    const hexToRgba = (hex: string, alpha: number) => {
      let c = hex.replace("#", "");
      if (c.length === 3) {
        c = c.split("").map((x) => x + x).join("");
      }
      const num = parseInt(c, 16);
      if (isNaN(num)) return `rgba(59, 130, 246, ${alpha})`;
      const r = (num >> 16) & 255;
      const g = (num >> 8) & 255;
      const b = num & 255;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    root.style.setProperty("--corthal-bg-main", colors.bgMain);
    root.style.setProperty("--corthal-bg-sidebar", colors.bgSidebar);
    root.style.setProperty("--corthal-bg-header", colors.bgHeader);
    root.style.setProperty("--corthal-bg-card", colors.bgCard);
    root.style.setProperty("--corthal-bg-input", colors.bgInput);
    root.style.setProperty("--corthal-bg-hover", colors.bgHover);
    root.style.setProperty("--corthal-bg-active", colors.bgActive);

    // Text & high contrast adjustments
    if (isHc) {
      root.style.setProperty("--corthal-fg-primary", "#ffffff");
      root.style.setProperty("--corthal-fg-secondary", "#e2e8f0");
      root.style.setProperty("--corthal-fg-muted", "#cbd5e1");
      root.style.setProperty("--corthal-border", "rgba(255, 255, 255, 0.28)");
      root.style.setProperty("--corthal-border-subtle", "rgba(255, 255, 255, 0.18)");
    } else {
      root.style.setProperty("--corthal-fg-primary", colors.fgPrimary);
      root.style.setProperty("--corthal-fg-secondary", colors.fgSecondary);
      root.style.setProperty("--corthal-fg-muted", colors.fgMuted);
      root.style.setProperty("--corthal-border", colors.border);
      root.style.setProperty("--corthal-border-subtle", colors.borderSubtle);
    }

    // Accent variables
    root.style.setProperty("--corthal-accent", accent.hex);
    root.style.setProperty("--corthal-accent-subtle", hexToRgba(accent.hex, 0.15));
    root.style.setProperty("--corthal-accent-subtle-hover", hexToRgba(accent.hex, 0.25));
    root.style.setProperty("--corthal-accent-border", hexToRgba(accent.hex, 0.35));
    root.style.setProperty("--corthal-accent-fg", "#ffffff");

    // Also set color-scheme for native inputs / scrollbars
    root.style.colorScheme = preset.category === "light" ? "light" : "dark";
  }
}

export const themeStore = new ThemeStore();
