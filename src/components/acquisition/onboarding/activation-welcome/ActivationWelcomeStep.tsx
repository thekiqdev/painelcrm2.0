import { ContactLivePreview } from '../contact-setup/ContactLivePreview';
import { ActivationEnvironmentReady } from './ActivationEnvironmentReady';
import { ActivationMobileFooter } from './ActivationMobileFooter';

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
}: Props) {
  if (layout === 'mobile-footer') {
    return null;
  }

  const preview = { name: leadName, email: leadEmail, phone: leadPhone };

  return (
    <div className="animate-in fade-in duration-400 fill-mode-both">
      <div className="flex flex-col gap-4 pb-4 lg:hidden">
        <ActivationEnvironmentReady
          name={leadName}
          email={leadEmail}
          phone={leadPhone}
          trialDays={trialDays}
          usersCount={usersCount}
          loading={loading}
          onContinue={onContinue}
          compact
        />
        <ContactLivePreview preview={preview} timelineStage="prepare_workspace" compact />
      </div>

      <div className="hidden h-full min-h-0 lg:grid lg:grid-cols-[1fr_minmax(0,300px)] lg:gap-6">
        <div className="flex min-h-0 flex-col justify-center overflow-y-auto pr-2">
          <ActivationEnvironmentReady
            name={leadName}
            email={leadEmail}
            phone={leadPhone}
            trialDays={trialDays}
            usersCount={usersCount}
            loading={loading}
            onContinue={onContinue}
          />
        </div>

        <aside className="flex min-h-0 flex-col" aria-label="Centro de ativação">
          <ContactLivePreview preview={preview} timelineStage="prepare_workspace" />
        </aside>
      </div>
    </div>
  );
}
