import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

/**
 * مفتاح التخزين الأساسي. كان التطبيق يستخدم مفتاحين مختلفين
 * (`theme` في سكربت منع الوميض، و`smart-inventory-theme` في الواجهة)
 * ما جعل الوضع الداكن لا يُستعاد قبل أول رسم للصفحة.
 */
const PRIMARY_STORAGE_KEY = "smart-inventory-theme";
const LEGACY_STORAGE_KEY = "theme";

/** ألوان شريط المتصفح/النظام لتطابق الوضع النشط */
const THEME_COLOR: Record<Theme, string> = {
  light: "#eef4f8",
  dark: "#101b24",
};

function readStoredTheme(fallback: Theme): Theme {
  if (typeof window === "undefined") return fallback;
  try {
    const primary = window.localStorage.getItem(PRIMARY_STORAGE_KEY);
    if (primary === "dark" || primary === "light") return primary;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === "dark" || legacy === "light") return legacy;
  } catch {
    /* التخزين قد يكون معطّلًا (تصفح خاص) — نكمل بالقيمة الافتراضية */
  }
  return fallback;
}

function applyThemeToDocument(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[theme];
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    switchable ? readStoredTheme(defaultTheme) : defaultTheme,
  );

  // useLayoutEffect حتى يُطبَّق الصنف قبل أول رسم مرئي (بدون وميض أبيض)
  const useIsomorphicLayoutEffect =
    typeof window === "undefined" ? useEffect : useLayoutEffect;

  useIsomorphicLayoutEffect(() => {
    applyThemeToDocument(theme);
    if (!switchable) return;
    try {
      window.localStorage.setItem(PRIMARY_STORAGE_KEY, theme);
      // نحافظ على المفتاح القديم متزامنًا حتى لا تتعارض أي شاشة قديمة
      window.localStorage.setItem(LEGACY_STORAGE_KEY, theme);
    } catch {
      /* تجاهل فشل التخزين */
    }
  }, [theme, switchable]);

  // مزامنة بين التبويبات المفتوحة
  useEffect(() => {
    if (!switchable) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PRIMARY_STORAGE_KEY && event.key !== LEGACY_STORAGE_KEY) return;
      const next = event.newValue;
      if (next === "dark" || next === "light") setThemeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [switchable]);

  const setTheme = useCallback(
    (next: Theme) => {
      if (!switchable) return;
      setThemeState(next);
    },
    [switchable],
  );

  const toggleTheme = useMemo(
    () =>
      switchable
        ? () => setThemeState(prev => (prev === "light" ? "dark" : "light"))
        : undefined,
    [switchable],
  );

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, switchable }),
    [theme, setTheme, toggleTheme, switchable],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

/** خيار آمن للاستخدام خارج المزوّد (مثل شاشات معاينة أو اختبارات). */
export function useOptionalTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  return (
    context ?? {
      theme: "light",
      setTheme: () => {},
      toggleTheme: undefined,
      switchable: false,
    }
  );
}
