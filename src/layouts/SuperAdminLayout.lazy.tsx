import { Suspense } from "react";
import { lazyWithReload } from "@/lib/lazyWithReload";
import { RouteLoadingFallback } from "@/components/RouteLoadingFallback";

const SuperAdminLayoutInner = lazyWithReload(() => import("./SuperAdminLayout"));

export default function SuperAdminLayout() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <SuperAdminLayoutInner />
    </Suspense>
  );
}
