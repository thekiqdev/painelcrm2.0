import { Suspense, type ReactNode } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const AppLayoutInner = lazyWithReload(() => import("./AppLayout"));

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <AppLayoutInner>{children}</AppLayoutInner>
    </Suspense>
  );
}
