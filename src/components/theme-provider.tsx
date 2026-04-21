import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

const STORAGE_KEY = "painelcrm-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey={STORAGE_KEY}
      themes={["light", "dark"]}
    >
      {children}
    </NextThemesProvider>
  );
}

export { STORAGE_KEY as THEME_STORAGE_KEY };
