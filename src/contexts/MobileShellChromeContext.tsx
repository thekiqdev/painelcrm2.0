import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type MobileShellChromeContextValue = {
  /** Quando true, o layout principal esconde a bottom navigation no mobile e reduz o padding inferior. */
  suppressMobileBottomNav: boolean;
  setSuppressMobileBottomNav: (value: boolean) => void;
  /**
   * Quando true, o `Header` global do AppLayout aparece no mobile (ex.: Dashboard).
   * Por defeito é false — listagens e gestão ganham altura útil; fluxos full screen mantêm header próprio na página.
   */
  showMobileGlobalHeader: boolean;
  setShowMobileGlobalHeader: (value: boolean) => void;
};

const MobileShellChromeContext = createContext<MobileShellChromeContextValue | null>(null);

/**
 * Controla cromo do shell no mobile (tab bar, header global).
 * Usar em páginas como Nova fatura (bottom nav) ou Dashboard (header global).
 */
export function MobileShellChromeProvider({ children }: { children: React.ReactNode }) {
  const [suppressMobileBottomNav, setSuppressMobileBottomNavState] = useState(false);
  const [showMobileGlobalHeader, setShowMobileGlobalHeaderState] = useState(false);

  const setSuppressMobileBottomNav = useCallback((value: boolean) => {
    setSuppressMobileBottomNavState(value);
  }, []);

  const setShowMobileGlobalHeader = useCallback((value: boolean) => {
    setShowMobileGlobalHeaderState(value);
  }, []);

  const value = useMemo(
    () => ({
      suppressMobileBottomNav,
      setSuppressMobileBottomNav,
      showMobileGlobalHeader,
      setShowMobileGlobalHeader,
    }),
    [suppressMobileBottomNav, setSuppressMobileBottomNav, showMobileGlobalHeader, setShowMobileGlobalHeader],
  );
  return <MobileShellChromeContext.Provider value={value}>{children}</MobileShellChromeContext.Provider>;
}

export function useMobileShellChrome(): MobileShellChromeContextValue {
  const ctx = useContext(MobileShellChromeContext);
  if (!ctx) {
    return {
      suppressMobileBottomNav: false,
      setSuppressMobileBottomNav: () => {},
      showMobileGlobalHeader: false,
      setShowMobileGlobalHeader: () => {},
    };
  }
  return ctx;
}
