import { Suspense, type ReactNode } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { AppShellLoadingFallback } from "@/components/AppShellLoadingFallback";

const AppShellInner = lazyWithReload(() => import("./shell/AppShell"));

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellLoadingFallback />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
