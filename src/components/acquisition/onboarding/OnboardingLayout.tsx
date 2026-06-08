import type { ReactNode } from 'react';
import { ActivationAppBackground } from './ActivationAppBackground';
import { ActivationAppSidebar } from './ActivationAppSidebar';
import { OnboardingMobileShell } from './OnboardingMobileShell';

type Props = {
  children: ReactNode;
  activeStepIndex: number;
  mobileFooter?: ReactNode;
  wideContent?: boolean;
  operationStepMobile?: boolean;
  reserveBottomSpace?: boolean;
};

/** App shell — 100vh fixo, sem scroll da página (scroll só no mobile quando necessário). */
export function OnboardingLayout({
  children,
  activeStepIndex,
  mobileFooter,
  wideContent,
  operationStepMobile,
  reserveBottomSpace,
}: Props) {
  return (
    <div className="dark relative flex h-[100dvh] overflow-hidden bg-[hsl(228,32%,4%)] text-foreground">
      <ActivationAppBackground />

      <div className="relative flex h-full w-full min-w-0">
        <ActivationAppSidebar activeStepIndex={activeStepIndex} />

        <OnboardingMobileShell
          activeStepIndex={activeStepIndex}
          footer={mobileFooter}
          compactHeader={operationStepMobile}
          reserveBottomSpace={reserveBottomSpace ?? operationStepMobile}
          hideFooterStepDots={operationStepMobile}
          lockViewport={wideContent}
        >
          <div
            className={
              wideContent
                ? 'flex h-full w-full justify-center max-lg:px-0 px-8 py-4 xl:px-10'
                : 'flex min-h-full flex-1 items-center justify-center px-10 py-10 xl:px-16'
            }
          >
            <div
              className={
                wideContent
                  ? 'flex h-full w-full max-w-[1500px] flex-col max-lg:max-w-none'
                  : 'w-full max-w-[720px]'
              }
            >
              {children}
            </div>
          </div>
        </OnboardingMobileShell>
      </div>
    </div>
  );
}
