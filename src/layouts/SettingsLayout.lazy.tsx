import { Suspense } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const SettingsLayoutInner = lazyWithReload(() => import("./SettingsLayout"));

export default function SettingsLayout() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <SettingsLayoutInner />
    </Suspense>
  );
}
