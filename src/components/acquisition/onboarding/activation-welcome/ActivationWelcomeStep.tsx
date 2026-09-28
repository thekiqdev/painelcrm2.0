import { slugifyOperationalName } from '@/lib/operationalSlug';
import { ActivationEnvironmentReady } from './ActivationEnvironmentReady';
import { PremiumWelcomeBottomBar } from './PremiumWelcomeBottomBar';
import { WorkspaceRevealSidebar } from './WorkspaceRevealSidebar';

type Props = {
  leadName: string;
  leadEmail: string;
  leadPhone: string;
  trialDays: number;
  usersCount: number;
  trialLabel: string | null;
  loading: boolean;
  onContinue: () => void;
  layout?: 'page' | 'mobile-footer';
  avatarPreview?: string | null;
  logoDarkPreview?: string | null;
  companyName?: string;
  workspaceSlug?: string;
};

export function ActivationWelcomeStep({
  leadName,
  leadEmail,
  leadPhone,
  trialDays,
  usersCount,
  loading,
  onContinue,
  layout = 'page',
  avatarPreview = null,
  logoDarkPreview = null,
  companyName,
  workspaceSlug,
}: Props) {
  if (layout === 'mobile-footer') {
    return null;
  }

  const operationName = (companyName ?? leadName).trim() || 'Minha operação';
  const slug = (workspaceSlug ?? slugifyOperationalName(operationName)).trim() || 'minha-operacao';

  const revealProps = {
    name: leadName,
    email: leadEmail,
    phone: leadPhone,
    trialDays,
    usersCount,
    companyName: operationName,
    workspaceSlug: slug,
    avatarPreview,
    logoDarkPreview,
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
        <ActivationEnvironmentReady {...revealProps} compact />
      </div>

      <div className="hidden h-full min-h-0 overflow-hidden lg:grid lg:grid-cols-[1fr_minmax(0,232px)] lg:gap-5">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ActivationEnvironmentReady {...revealProps} />
          </div>
          <PremiumWelcomeBottomBar loading={loading} onContinue={onContinue} />
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden">
          <WorkspaceRevealSidebar
            adminName={leadName}
            logoDarkUrl={logoDarkPreview}
            avatarUrl={avatarPreview}
          />
        </aside>
      </div>
    </div>
  );
}
