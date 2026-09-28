import * as React from "react";
import { cn } from "@/lib/utils";
import { COMMERCIAL_LIST_PAGE_OUTER } from "@/lib/commercialListUi";

export function CommercialListingPageShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(COMMERCIAL_LIST_PAGE_OUTER, className)}>{children}</div>;
}
