import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";

const STORAGE_KEY = "painelcrm-theme";

const ALLOWED_THEMES = new Set(["light", "dark"]);

/**
 * Migra valores inválidos em `localStorage` (ex.: "system" de versões antigas).
 * Com `themes={["light","dark"]}` apenas, um valor estranho podia deixar o estado
 * do next-themes incoerente com a classe no `<html>` e causar piscar claro/escuro.
 */
function ThemeStorageSanitizer() {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw && !ALLOWED_THEMES.has(raw)) {
        localStorage.setItem(STORAGE_KEY, "light");
        setTheme("light");
        return;
      }
      if (theme && !ALLOWED_THEMES.has(theme)) {
        setTheme("light");
      }
    } catch {
      /* ignore */
    }
  }, [theme, setTheme]);

  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      enableColorScheme={false}
      disableTransitionOnChange
      storageKey={STORAGE_KEY}
      themes={["light", "dark"]}
    >
      <ThemeStorageSanitizer />
      {children}
    </NextThemesProvider>
  );
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
