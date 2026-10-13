import type { Locale, TranslationSchema } from "./types";
import { ru } from "./ru";
import { en } from "./en";

const STORAGE_KEY = "cortex_locale";

const dictionaries: Record<Locale, TranslationSchema> = {
  ru,
  en,
};

export class I18nStore {
  locale = $state<Locale>("ru");

  constructor() {
    this.initLocale();
  }

  private initLocale() {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved && (saved === "ru" || saved === "en")) {
        this.locale = saved;
        return;
      }
      // Fallback: detect system browser language
      const navLang = navigator.language?.toLowerCase() || "";
      if (navLang.startsWith("en")) {
        this.locale = "en";
      } else {
        this.locale = "ru";
      }
    } catch (e) {
      console.warn("Failed to read locale from localStorage:", e);
      this.locale = "ru";
    }
  }

  setLocale(newLocale: Locale) {
    if (this.locale === newLocale) return;
    this.locale = newLocale;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, newLocale);
      } catch (e) {
        console.warn("Failed to save locale to localStorage:", e);
      }
    }
  }

  /**
   * Translates a dot-notated key (e.g. "common.save", "statusbar.words")
   * with optional interpolation parameters: { count: 5 } -> "{count} слов" -> "5 слов"
   */
  t(path: string, params?: Record<string, string | number>): string {
    // Read this.locale so Svelte 5 tracks reactivity
    const activeLocale = this.locale;
    const currentDict = dictionaries[activeLocale] || dictionaries.ru;

    let val: any = this.resolvePath(currentDict, path);

    // Fallback to Russian if key is missing in active language
    if (val === undefined || val === null) {
      val = this.resolvePath(dictionaries.ru, path);
    }

    if (val === undefined || val === null) {
      return path;
    }

    let result = String(val);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replaceAll(`{${k}}`, String(v));
      }
    }

    return result;
  }

  private resolvePath(obj: any, path: string): any {
    const parts = path.split(".");
    let curr = obj;
    for (const part of parts) {
      if (curr === undefined || curr === null) return undefined;
      curr = curr[part];
    }
    return curr;
  }
}

export const i18n = new I18nStore();
export const t = (path: string, params?: Record<string, string | number>) => i18n.t(path, params);
