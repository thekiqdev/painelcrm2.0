import React from "react";
import { SettingsBackHeader } from "./SettingsBackHeader";
import { cn } from "@/lib/utils";

type MobileSettingsSectionScreenProps = {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  className?: string;
};

export function MobileSettingsSectionScreen({ title, onBack, children, className }: MobileSettingsSectionScreenProps) {
  return (
    <div className={cn("flex min-h-[100dvh] flex-col bg-background animate-in fade-in duration-200", className)}>
      <SettingsBackHeader title={title} onBack={onBack} />
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 pb-[max(6rem,env(safe-area-inset-bottom,0px))] pt-4",
          "max-md:pb-28",
        )}
      >
        <div className="mx-auto w-full max-w-lg pb-8">{children}</div>
      </div>
    </div>
  );
}
