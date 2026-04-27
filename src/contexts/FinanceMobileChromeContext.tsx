import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type FinanceMobileChromeContextValue = {
  suppressBottomBar: boolean;
  setSuppressBottomBar: (value: boolean) => void;
};

const FinanceMobileChromeContext = createContext<FinanceMobileChromeContextValue | null>(null);

export function FinanceMobileChromeProvider({ children }: { children: React.ReactNode }) {
  const [suppressBottomBar, setSuppressBottomBarState] = useState(false);

  const setSuppressBottomBar = useCallback((value: boolean) => {
    setSuppressBottomBarState(value);
  }, []);

  const value = useMemo(
    () => ({ suppressBottomBar, setSuppressBottomBar }),
    [suppressBottomBar, setSuppressBottomBar]
  );

  return <FinanceMobileChromeContext.Provider value={value}>{children}</FinanceMobileChromeContext.Provider>;
}

export function useFinanceMobileChrome(): FinanceMobileChromeContextValue {
  const ctx = useContext(FinanceMobileChromeContext);
  if (!ctx) {
    return { suppressBottomBar: false, setSuppressBottomBar: () => {} };
  }
  return ctx;
}

/** Esconde a barra inferior de acções ao abrir modais / sheets (mobile). */
export function useFinanceBottomBarVisibility(suppress: boolean) {
  const { setSuppressBottomBar } = useFinanceMobileChrome();
  useEffect(() => {
    setSuppressBottomBar(suppress);
    return () => setSuppressBottomBar(false);
  }, [suppress, setSuppressBottomBar]);
}
