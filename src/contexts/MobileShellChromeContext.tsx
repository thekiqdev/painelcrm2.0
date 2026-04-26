import React, { createContext, useContext, useMemo, useState } from "react";

type MobileShellChromeContextValue = {
  /** Quando true, o layout principal esconde a bottom navigation no mobile e reduz o padding inferior. */
  suppressMobileBottomNav: boolean;
  setSuppressMobileBottomNav: (value: boolean) => void;
};

const MobileShellChromeContext = createContext<MobileShellChromeContextValue | null>(null);

/**
 * Controla cromo do shell no mobile (ex.: esconder tab bar em fluxos full screen).
 * Usar em páginas como Nova fatura, Nova proposta, etc.
 */
export function MobileShellChromeProvider({ children }: { children: React.ReactNode }) {
  const [suppressMobileBottomNav, setSuppressMobileBottomNav] = useState(false);
  const value = useMemo(
    () => ({ suppressMobileBottomNav, setSuppressMobileBottomNav }),
    [suppressMobileBottomNav],
  );
  return <MobileShellChromeContext.Provider value={value}>{children}</MobileShellChromeContext.Provider>;
}

export function useMobileShellChrome(): MobileShellChromeContextValue {
  const ctx = useContext(MobileShellChromeContext);
  if (!ctx) {
    return {
      suppressMobileBottomNav: false,
      setSuppressMobileBottomNav: () => {},
    };
  }
  return ctx;
}
